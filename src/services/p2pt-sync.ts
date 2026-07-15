/**
 * P2PT Sync Provider for Yjs
 *
 * A Yjs provider that uses p2pt (WebTorrent-based P2P) for peer discovery
 * and synchronization. Uses one p2pt instance per sync key, with the sync
 * key hashed to create the torrent info-hash for discovery.
 *
 * Protocol messages use 32-bit type codes:
 * - 0x01: CHALLENGE - Authentication challenge
 * - 0x02: CHALLENGE_RESP - Challenge response (HMAC-SHA256)
 * - 0x03: STATE_VECTOR - Request/send state vector
 * - 0x04: STATE_UPDATE - State update (full or diff)
 * - 0x05: DOC_UPDATE - Document update
 * - 0x06: AWARENESS_UPDATE - Awareness protocol update
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { Observable } from "lib0/observable";

// p2pt types
type P2PTPeer = {
  id: string;
};

// Message type codes
const MSG_CHALLENGE = 0x01;
const MSG_CHALLENGE_RESP = 0x02;
const MSG_STATE_VECTOR = 0x03;
const MSG_STATE_UPDATE = 0x04;
const MSG_DOC_UPDATE = 0x05;
const MSG_AWARENESS_UPDATE = 0x06;

// Default WebTorrent tracker URLs
export const DEFAULT_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz:443/",
];

// Validation timeout in milliseconds
const PEER_VALIDATION_TIMEOUT = 60000;

// Per-sync-key p2pt instance data
interface SyncKeyData {
  syncKey: string;
  p2pt: any;
  peers: Map<string, PeerConnection>;
  peerSyncKey: Map<string, string>;
}

// Peer connection state
interface PeerConnection {
  peer: P2PTPeer;
  validated: boolean;
  queuedMessages: Uint8Array[];
  validationTimer: number | null;
}

/**
 * Compute SHA-256 hash and return as hex string
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const buf = await crypto.subtle.digest("sha-256", data.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute HMAC-SHA256
 */
async function hmacSha256(
  key: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    message.buffer as ArrayBuffer,
  );
  return new Uint8Array(signature);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a message from bytes
 * Format: [type: 4 bytes][length: 4 bytes][payload: length bytes]
 */
function parseMessage(
  data: Uint8Array,
): { type: number; payload: Uint8Array } | null {
  if (data.length < 8) return null;
  const view = new DataView(data.buffer, data.byteOffset);
  const type = view.getUint32(0, true); // Little-endian
  const length = view.getUint32(4, true);
  if (data.length < 8 + length) return null;
  const payload = data.slice(8, 8 + length);
  return { type, payload };
}

/**
 * Create a message bytes
 */
function createMessage(type: number, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + payload.length);
  const view = new DataView(result.buffer, result.byteOffset);
  view.setUint32(0, type, true); // Little-endian
  view.setUint32(4, payload.length, true);
  result.set(payload, 8);
  return result;
}

/**
 * P2PT Sync Provider
 *
 * A Yjs provider that uses p2pt for peer-to-peer synchronization.
 * Creates separate p2pt instance per sync key.
 */
export class P2PTSyncProvider extends Observable<any> {
  private ydoc: Y.Doc;
  private syncKeyData: Map<string, SyncKeyData> = new Map();
  private awareness: Awareness;
  private trackerURLs: string[];
  private destroyed: boolean = false;

  // Store document update handler reference for cleanup
  private updateHandler = this.handleDocumentUpdate.bind(this);

  // Callbacks for status updates
  public onStatusChange:
    | ((status: {
        connected: boolean;
        peers: number;
        syncKeys: string[];
      }) => void)
    | null = null;

  /**
   * @param ydoc - The Yjs document to sync
   * @param syncKeys - Array of sync keys (shared secrets) to participate in
   * @param trackerURLs - Optional array of WebTorrent tracker URLs
   */
  constructor(ydoc: Y.Doc, syncKeys: string[], trackerURLs: string[] = []) {
    super();
    this.ydoc = ydoc;
    this.trackerURLs = trackerURLs;
    this.awareness = new Awareness(ydoc);

    // Listen to awareness changes
    this.awareness.on("change", () => {
      this.broadcastAwarenessUpdate();
    });

    // Create p2pt instance for each sync key
    for (const syncKey of syncKeys) {
      this.createSyncKeyData(syncKey);
    }
  }

  /**
   * Create p2pt instance data for a sync key
   */
  private async createSyncKeyData(syncKey: string): Promise<SyncKeyData> {
    // Hash sync key to get torrent info-hash
    const infoHash = await sha256(syncKey);

    const data: SyncKeyData = {
      syncKey,
      p2pt: null,
      peers: new Map(),
      peerSyncKey: new Map(),
    };

    // Dynamic import p2pt
    const P2PT = (await import("p2pt")).default;

    // Create p2pt instance with hashed sync key as identifier
    data.p2pt = new P2PT(this.trackerURLs, infoHash);

    // Set up event handlers bound to this sync key
    data.p2pt.on("peerconnect", (peer: P2PTPeer) =>
      this.handlePeerConnect(syncKey, peer),
    );
    data.p2pt.on("peerclose", (peer: P2PTPeer) =>
      this.handlePeerClose(syncKey, peer),
    );
    data.p2pt.on("msg", (peer: P2PTPeer, msg: any) =>
      this.handleMessage(syncKey, peer, msg),
    );

    data.p2pt.on("trackerconnect", (err: any, stats: any) => {
      console.log("Connected to tracker:", stats);
    });

    data.p2pt.on("trackerwarning", (err: any) => {
      console.error("Error with tracker:", err);
    });

    // Start the p2pt instance
    data.p2pt.start();

    this.syncKeyData.set(syncKey, data);
    console.log(
      `[P2PT] Started with sync key: ${syncKey.substring(0, 8)}... -> ${infoHash.substring(0, 8)}...`,
    );

    return data;
  }

  /**
   * Initialize the p2pt connection
   */
  async start(): Promise<void> {
    if (this.destroyed) return;
    // All p2pt instances are already started in constructor
    this.ydoc.on("update", this.updateHandler);
    this.notifyStatusChange();
  }

  /**
   * Add a new sync key to participate in
   */
  async addSyncKey(syncKey: string): Promise<void> {
    if (this.syncKeyData.has(syncKey) || this.destroyed) return;

    await this.createSyncKeyData(syncKey);
    this.ydoc.on("update", this.updateHandler);
    this.notifyStatusChange();
  }

  /**
   * Remove a sync key
   */
  removeSyncKey(syncKey: string): void {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    // Remove all peers for this sync key
    for (const peerId of data.peers.keys()) {
      this.removePeer(syncKey, peerId);
    }

    // Destroy p2pt instance
    if (data.p2pt) {
      try {
        data.p2pt.destroy();
      } catch (e) {
        console.error("[P2PT] Error destroying p2pt:", e);
      }
    }

    this.syncKeyData.delete(syncKey);
    this.notifyStatusChange();
  }

  /**
   * Handle a new peer connection
   */
  private async handlePeerConnect(
    syncKey: string,
    peer: P2PTPeer,
  ): Promise<void> {
    if (this.destroyed) return;

    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    console.log(
      `[P2PT] Peer connected to ${syncKey.substring(0, 8)}...: ${peer.id}`,
    );

    // Check if we already have this peer
    if (data.peers.has(peer.id)) {
      console.log(`[P2PT] Peer already exists: ${peer.id}`);
      return;
    }

    // Create peer connection state
    const conn: PeerConnection = {
      peer,
      validated: false,
      queuedMessages: [],
      validationTimer: null,
    };

    data.peers.set(peer.id, conn);
    data.peerSyncKey.set(peer.id, syncKey);

    // Set validation timeout
    conn.validationTimer = window.setTimeout(() => {
      if (!conn.validated) {
        console.log(`[P2PT] Peer validation timeout: ${peer.id}`);
        this.removePeer(syncKey, peer.id);
      }
    }, PEER_VALIDATION_TIMEOUT);

    // Send authentication challenge
    await this.sendChallenge(syncKey, peer.id);

    this.notifyStatusChange();
  }

  /**
   * Handle peer disconnection
   */
  private handlePeerClose(syncKey: string, peer: P2PTPeer): void {
    console.log(
      `[P2PT] Peer disconnected from ${syncKey.substring(0, 8)}...: ${peer.id}`,
    );
    this.removePeer(syncKey, peer.id);
  }

  /**
   * Remove a peer and clean up
   */
  private removePeer(syncKey: string, peerId: string): void {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (conn) {
      if (conn.validationTimer) {
        clearTimeout(conn.validationTimer);
      }
      data.peers.delete(peerId);
      data.peerSyncKey.delete(peerId);
      this.notifyStatusChange();
    }
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(
    syncKey: string,
    peer: P2PTPeer,
    msg: any,
  ): Promise<void> {
    if (this.destroyed) return;

    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peer.id);
    if (!conn) {
      console.log(`[P2PT] Message from unknown peer: ${peer.id}`);
      return;
    }

    // Convert message to Uint8Array if needed
    let dataBytes: Uint8Array;
    if (msg instanceof Uint8Array) {
      dataBytes = msg;
    } else if (ArrayBuffer.isView(msg)) {
      dataBytes = new Uint8Array(msg.buffer);
    } else if (typeof msg === "string") {
      // Decode base64 to Uint8Array
      const binary = atob(msg);
      dataBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        dataBytes[i] = binary.charCodeAt(i);
      }
    } else {
      console.warn("[P2PT] Unknown message type:", typeof msg);
      return;
    }

    // Parse the message
    const parsed = parseMessage(dataBytes);
    if (!parsed) {
      console.warn("[P2PT] Failed to parse message");
      return;
    }

    // Queue message if peer not validated (unless it's a challenge response)
    if (!conn.validated && parsed.type !== MSG_CHALLENGE_RESP
      && parsed.type !== MSG_CHALLENGE
    ) {
      conn.queuedMessages.push(dataBytes);
      return;
    }

    // Process the message
    await this.processMessage(syncKey, peer.id, parsed);
  }

  /**
   * Process a validated message
   */
  private async processMessage(
    syncKey: string,
    peerId: string,
    parsed: { type: number; payload: Uint8Array },
  ): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    switch (parsed.type) {
      case MSG_CHALLENGE:
        await this.handleChallenge(syncKey, peerId, parsed.payload);
        break;

      case MSG_CHALLENGE_RESP:
        await this.handleChallengeResponse(syncKey, peerId, parsed.payload);
        break;

      case MSG_STATE_VECTOR:
        await this.handleStateVector(syncKey, peerId, parsed.payload);
        break;

      case MSG_STATE_UPDATE:
        await this.handleStateUpdate(syncKey, peerId, parsed.payload);
        break;

      case MSG_DOC_UPDATE:
        this.handleDocUpdate(syncKey, peerId, parsed.payload);
        break;

      case MSG_AWARENESS_UPDATE:
        this.handleAwarenessUpdate(syncKey, peerId, parsed.payload);
        break;

      default:
        console.warn(`[P2PT] Unknown message type: ${parsed.type}`);
    }
  }

  /**
   * Send authentication challenge to peer
   */
  private async sendChallenge(syncKey: string, peerId: string): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    // Generate random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Store challenge for validation
    (conn.peer as any).challenge = uint8ArrayToHex(challenge);

    // Send challenge
    const payload = new Uint8Array(32);
    payload.set(challenge, 0);

    const msg = createMessage(MSG_CHALLENGE, payload);
    data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
  }

  /**
   * Handle incoming challenge - respond with HMAC
   */
  private async handleChallenge(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    if (payload.length < 32) {
      console.warn("[P2PT] Challenge payload too short");
      return;
    }

    const challengeHex = uint8ArrayToHex(payload.slice(0, 32));

    // Compute HMAC response
    const syncKeyBytes = new TextEncoder().encode(syncKey);
    const challengeBytes = hexToUint8Array(challengeHex);
    const response = await hmacSha256(syncKeyBytes, challengeBytes);

    const msg = createMessage(MSG_CHALLENGE_RESP, response);
    data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
  }

  /**
   * Handle challenge response - validate and complete handshake
   */
  private async handleChallengeResponse(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    if (payload.length < 32) {
      console.warn("[P2PT] Challenge response payload too short");
      return;
    }

    const response = payload.slice(0, 32);

    // Verify HMAC
    const syncKeyBytes = new TextEncoder().encode(syncKey);
    const challengeBytes = hexToUint8Array((conn.peer as any).challenge || "");

    if (!challengeBytes.length) {
      console.warn("[P2PT] No stored challenge");
      return;
    }

    const expectedResponse = await hmacSha256(syncKeyBytes, challengeBytes);

    // Compare responses
    const responseHex = uint8ArrayToHex(response);
    const expectedHex = uint8ArrayToHex(expectedResponse);

    if (responseHex === expectedHex) {
      console.log(`[P2PT] Peer validated: ${peerId}`);
      conn.validated = true;

      // Process queued messages
      for (const msg of conn.queuedMessages) {
        const parsed = parseMessage(msg);
        if (parsed) {
          await this.processMessage(syncKey, peerId, parsed);
        }
      }
      conn.queuedMessages = [];

      // Send our state vector
      await this.sendStateVector(syncKey, peerId);
    } else {
      console.warn(`[P2PT] Invalid challenge response from: ${peerId}`);
      this.removePeer(syncKey, peerId);
    }
  }

  /**
   * Send our state vector to a peer
   */
  private async sendStateVector(
    syncKey: string,
    peerId: string,
  ): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    const stateVector = Y.encodeStateVector(this.ydoc);
    const msg = createMessage(MSG_STATE_VECTOR, stateVector);
    data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
  }

  /**
   * Handle incoming state vector - send our state
   */
  private async handleStateVector(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): Promise<void> {
    const data = this.syncKeyData.get(syncKey);
    if (!data) return;

    const conn = data.peers.get(peerId);
    if (!conn) return;

    // Encode our state as update based on their state vector
    const stateUpdate = Y.encodeStateAsUpdate(this.ydoc, payload);
    const msg = createMessage(MSG_STATE_UPDATE, stateUpdate);
    data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
  }

  /**
   * Handle incoming state update - apply to document
   */
  private async handleStateUpdate(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): Promise<void> {
    Y.applyUpdate(this.ydoc, payload, this);
  }

  /**
   * Handle document update from peers
   */
  private handleDocUpdate(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): void {
    Y.applyUpdate(this.ydoc, payload, this);
  }

  /**
   * Handle awareness update from peer
   */
  private handleAwarenessUpdate(
    syncKey: string,
    peerId: string,
    payload: Uint8Array,
  ): void {
    try {
      const update = JSON.parse(new TextDecoder().decode(payload));
      this.awareness.setLocalStateField("user", update.user);
    } catch (e) {
      console.error("[P2PT] Failed to parse awareness update:", e);
    }
  }

  /**
   * Broadcast awareness update to all validated peers
   */
  private broadcastAwarenessUpdate(): void {
    const localState = this.awareness.getLocalState();
    if (!localState) return;

    const payload = new TextEncoder().encode(
      JSON.stringify({ user: localState.user || {} }),
    );
    const msg = createMessage(MSG_AWARENESS_UPDATE, payload);

    for (const [_syncKey, data] of this.syncKeyData) {
      for (const conn of data.peers.values()) {
        if (conn.validated && data.p2pt) {
          try {
              data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
            } catch (e) {
              console.error("[P2PT] Failed to send awareness update:", e);
          }
        }
      }
    }
  }

  /**
   * Handle document updates from Yjs
   */
  private handleDocumentUpdate(
    update: Uint8Array,
    origin: any,
    doc: Y.Doc,
  ): void {
    // Don't send updates that came from this provider
    if (origin === this) return;

    const msg = createMessage(MSG_DOC_UPDATE, update);

    // Send to all validated peers in all sync keys
    for (const [_syncKey, data] of this.syncKeyData) {
      for (const [peerId, conn] of data.peers) {
        if (!conn.validated || !data.p2pt) continue;

        // Don't send back to the peer that sent us this update
        if (origin === peerId) continue;

        try {
          data.p2pt.send(conn.peer, btoa(String.fromCharCode(...msg)));
        } catch (e) {
          console.error(`[P2PT] Failed to send update to ${peerId}:`, e);
        }
      }
    }
  }

  /**
   * Notify status change callback
   */
  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      let totalPeers = 0;
      for (const data of this.syncKeyData.values()) {
        totalPeers += Array.from(data.peers.values()).filter(
          (c) => c.validated,
        ).length;
      }

      this.onStatusChange({
        connected: !this.destroyed && this.syncKeyData.size > 0,
        peers: totalPeers,
        syncKeys: Array.from(this.syncKeyData.keys()),
      });
    }

    this.emit("status", [
      {
        connected: !this.destroyed && this.syncKeyData.size > 0,
        peers: Array.from(this.syncKeyData.values()).reduce(
          (sum, data) =>
            sum +
            Array.from(data.peers.values()).filter((c) => c.validated).length,
          0,
        ),
        syncKeys: Array.from(this.syncKeyData.keys()),
      },
    ]);
  }

  /**
   * Get the awareness instance
   */
  getAwareness(): Awareness {
    return this.awareness;
  }

  /**
   * Get current connection status
   */
  getStatus(): { connected: boolean; peers: number; syncKeys: string[] } {
    let totalPeers = 0;
    for (const data of this.syncKeyData.values()) {
      totalPeers += Array.from(data.peers.values()).filter(
        (c) => c.validated,
      ).length;
    }

    return {
      connected: !this.destroyed && this.syncKeyData.size > 0,
      peers: totalPeers,
      syncKeys: Array.from(this.syncKeyData.keys()),
    };
  }

  /**
   * Check if connected to a specific sync key
   */
  isConnectedTo(syncKey: string): boolean {
    return this.syncKeyData.has(syncKey) && !this.destroyed;
  }

  /**
   * Destroy the provider and disconnect
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove update handler
    this.ydoc.off("update", this.updateHandler);

    // Destroy all p2pt instances
    for (const [syncKey, data] of this.syncKeyData) {
      // Clear validation timers
      for (const conn of data.peers.values()) {
        if (conn.validationTimer) {
          clearTimeout(conn.validationTimer);
        }
      }

      if (data.p2pt) {
        try {
          data.p2pt.destroy();
        } catch (e) {
          console.error("[P2PT] Error destroying p2pt:", e);
        }
      }
    }

    this.syncKeyData.clear();

    // Destroy awareness
    this.awareness.destroy();

    this.notifyStatusChange();
    super.destroy();
  }
}

/**
 * Generate a random sync key
 */
export function generateSyncKey(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
