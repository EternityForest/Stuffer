import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import Peer, { type DataConnection } from "peerjs";
import { generateItemId } from "./uuid.js";
import {
  setWorkspaceLocalSettingKey,
  getWorkspaceLocalSettings,
} from "./local-settings.js";
import convert from "convert";

interface WorkspaceMetadata {
  name: string;
  createdAt: string;
  syncRoomKey: string;
}

// Workspace registry (persisted to localStorage)
const workspaceRegistry = new Map<string, WorkspaceMetadata>();
const workspaceDocs = new Map<string, Y.Doc>();
const workspacePersistence = new Map<string, IndexeddbPersistence>();
let initPromise: Promise<void> | null = null;

// Per-workspace peer instance
const peerInstances = new Map<string, Peer>();

// Per-workspace connections: Map of remote peer ID → DataConnection
const peerConnections = new Map<string, Map<string, DataConnection>>();

// Track connected peers per workspace
const connectedPeers = new Map<string, Set<string>>();

// Registry key for localStorage
const REGISTRY_KEY = "stuffer:workspace-registry";

// Registry persistence helpers
function loadWorkspaceRegistry(): Map<string, WorkspaceMetadata> {
  try {
    const stored = localStorage.getItem(REGISTRY_KEY);
    if (!stored) return new Map();
    const data = JSON.parse(stored);
    return new Map(Object.entries(data)) as Map<string, WorkspaceMetadata>;
  } catch (error) {
    console.error("Failed to load workspace registry:", error);
    return new Map();
  }
}

function saveWorkspaceRegistry(): void {
  try {
    const data = Object.fromEntries(workspaceRegistry);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save workspace registry:", error);
  }
}

// Initialize by loading workspace registry
export async function initializeYDoc() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const registry = loadWorkspaceRegistry();
    workspaceRegistry.clear();
    registry.forEach((meta, key) => workspaceRegistry.set(key, meta));
  })();

  await initPromise;
}

// Get or create a workspace Y.Doc
export async function getWorkspaceDoc(workspaceKey: string): Promise<Y.Doc> {
  if (workspaceDocs.has(workspaceKey)) {
    return workspaceDocs.get(workspaceKey)!;
  }

  // Create new Y.Doc for workspace
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(
    `stuffer-workspace-${workspaceKey}`,
    doc
  );

  // Wait for sync
  await new Promise<void>((resolve) => {
    const checkSynced = () => {
      if (persistence.synced) {
        resolve();
      } else {
        setTimeout(checkSynced, 50);
      }
    };
    checkSynced();
  });

  // Give IndexedDB a moment to fully populate the doc
  await new Promise((resolve) => setTimeout(resolve, 100));

  workspaceDocs.set(workspaceKey, doc);
  workspacePersistence.set(workspaceKey, persistence);
  return doc;
}
// Export for component listeners
export async function getWorkspaceDocExported(workspaceKey: string): Promise<Y.Doc> {
  return getWorkspaceDoc(workspaceKey);
}

// Return list of workspaces from registry
export async function getWorkspacesMap() {
  const result = new Map<string, { name: string; key: string }>();
  for (const [key, metadata] of workspaceRegistry) {
    result.set(key, { name: metadata.name, key });
  }
  return result;
}

export async function createWorkspace(name: string) {
  const workspaceKey = `workspace-${Date.now()}`;

  // Create metadata
  const metadata: WorkspaceMetadata = {
    name,
    createdAt: new Date().toISOString(),
    syncRoomKey: workspaceKey,
  };

  // Add to registry
  workspaceRegistry.set(workspaceKey, metadata);
  saveWorkspaceRegistry();

  // Create and initialize workspace doc
  const doc = await getWorkspaceDoc(workspaceKey);
  const metadataMap = doc.getMap("metadata");
  doc.getMap("objects"); // Initialize objects map
  doc.getMap("loadouts"); // Initialize loadouts map

  metadataMap.set("name", name);
  metadataMap.set("syncRoomKey", workspaceKey);

  return workspaceKey;
}

export async function getWorkspace(key: string) {
  const doc = await getWorkspaceDoc(key);
  return doc.getMap("metadata");
}

export async function deleteWorkspace(key: string) {
  // Remove from registry
  workspaceRegistry.delete(key);
  saveWorkspaceRegistry();

  // Destroy doc and persistence
  const doc = workspaceDocs.get(key);
  const persistence = workspacePersistence.get(key);

  if (persistence) {
    persistence.destroy();
    workspacePersistence.delete(key);
  }

  if (doc) {
    doc.destroy();
    workspaceDocs.delete(key);
  }

  // Delete from IndexedDB
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`stuffer-workspace-${key}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function addItem(workspaceKey: string, itemName: string, uuid?: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const itemId = uuid || generateItemId();

  const item = new Y.Map();
  item.set("name", itemName);
  item.set("createdAt", new Date().toISOString());
  item.set("title", itemName);
  item.set("description", "");
  item.set("contents", new Y.Map());
  item.set("amountUpdates", new Y.Array());

  objectsMap.set(itemId, item);
  return itemId;
}

export async function getItems(workspaceKey: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const items: Array<{
    id: string;
    name: string;
    createdAt: string;
  }> = [];

  objectsMap.forEach((item, id) => {
    items.push({
      id,
      name: item.get("name") as string,
      createdAt: item.get("createdAt") as string,
    });
  });

  return items;
}

export async function findItemById(workspaceKey: string, ulid: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  return objectsMap.get(ulid) as Y.Map<any>;
}

export async function lookupItemName(workspaceKey: string, itemId: string) {
  try {
    const item = await getItem(workspaceKey, itemId);
    return item.name;
  } catch (e) {
    return "Unknown";
  }
}

export async function deleteItem(workspaceKey: string, itemId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  objectsMap.delete(itemId);
}

export async function getItem(workspaceKey: string, itemId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  return {
    id: itemId,
    name: item.get("name") as string,
    title: item.get("title") as string,
    description: item.get("description") as string,
    createdAt: item.get("createdAt") as string,
    imageData: item.get("imageData") as string | undefined,
    selectedLoadout: item.get("selectedLoadout") as string | null,
  };
}

export async function updateItemProperty(
  workspaceKey: string,
  itemId: string,
  property: string,
  value: any
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  item.set(property, value);
}

export async function getItemContents(workspaceKey: string, itemId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  let contentsMap = item.get("contents") as Y.Map<any>;

  // Initialize contents map if it doesn't exist (for items created before this feature)
  if (!contentsMap) {
    contentsMap = new Y.Map();
    item.set("contents", contentsMap);
  }

  const contents: Array<{ id: string; name: string; }> = [];

  for (const id of contentsMap.keys()) {
    try {
      const foundItem = await getItem(workspaceKey, id);
      if (foundItem) {
        contents.push({
          id,
          name: await lookupItemName(workspaceKey, id),
        });
      }
    } catch (e) {
      contents.push({
        id,
        name: "Unknown",
      });
      console.error(e);
    }
  }

  return contents;
}

export async function addItemToContents(
  workspaceKey: string,
  containerId: string,
  itemId: string,
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const container = objectsMap.get(containerId) as Y.Map<any>;
  if (!container) throw new Error("Container not found");

  // Remove item from any other containers first
  objectsMap.forEach((item) => {
    const itemContentsMap = item.get("contents") as Y.Map<any>;
    if (itemContentsMap && itemContentsMap.has(itemId)) {
      itemContentsMap.delete(itemId);
    }
  });

  const contentsMap = container.get("contents") as Y.Map<any>;

  const content = new Y.Map();
  content.set("itemId", itemId);

  contentsMap.set(itemId, content);
}

export async function removeItemFromContents(
  workspaceKey: string,
  containerId: string,
  contentItemId: string
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const container = objectsMap.get(containerId) as Y.Map<any>;
  if (!container) throw new Error("Container not found");

  const contentsMap = container.get("contents") as Y.Map<any>;
  contentsMap.delete(contentItemId);
}

export async function createLoadout(
  workspaceKey: string,
  title: string,
  description: string = "",
  contents: Array<{ itemId: string;}> = []
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  const loadoutId = generateItemId();

  const loadout = new Y.Map();
  loadout.set("title", title);
  loadout.set("description", description);
  loadout.set("createdAt", new Date().toISOString());

  const loadoutContents = new Y.Map();
  contents.forEach(({ itemId }) => {
    const content = new Y.Map();
    loadoutContents.set(itemId, content);
  });

  loadout.set("contents", loadoutContents);
  loadoutsMap.set(loadoutId, loadout);

  return loadoutId;
}

export async function saveObjectAsLoadout(
  workspaceKey: string,
  objectId: string,
  title: string,
  description: string = ""
) {
  const objectContents = await getItemContents(workspaceKey, objectId);
  return createLoadout(
    workspaceKey,
    title,
    description,
    objectContents.map((c) => ({
      itemId: c.id,
    }))
  );
}

export async function getLoadouts(workspaceKey: string) {

  const workspace = await getWorkspaceDoc(workspaceKey);
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.getMap("loadouts") as Y.Map<any>;
  const loadouts: Array<{
    id: string;
    title: string;
    description: string;
    itemCount: number;
    createdAt: string;
  }> = [];

  loadoutsMap.forEach((loadout, id) => {
    const contentsMap = (loadout as Y.Map<any>).get("contents") as Y.Map<any>;
    loadouts.push({
      id,
      title: (loadout as Y.Map<any>).get("title") as string,
      description: (loadout as Y.Map<any>).get("description") as string,
      itemCount: contentsMap ? contentsMap.size : 0,
      createdAt: (loadout as Y.Map<any>).get("createdAt") as string,
    });
  });

  return loadouts;
}

export async function getLoadout(workspaceKey: string, loadoutId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.getMap(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  const contentsMap = loadout.get("contents") as Y.Map<any>;
  const contents: Array<{ id: string; name: string;}> = [];

  contentsMap.forEach((content, id) => {
    contents.push({
      id,
      name: (content as Y.Map<any>).get("name") as string,
    });
  });

  return {
    id: loadoutId,
    title: loadout.get("title") as string,
    description: loadout.get("description") as string,
    contents,
    createdAt: loadout.get("createdAt") as string,
  };
}

export async function updateLoadoutProperty(
  workspaceKey: string,
  loadoutId: string,
  property: string,
  value: any
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.getMap(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  loadout.set(property, value);
}

export async function addItemToLoadout(
  workspaceKey: string,
  loadoutId: string,
  itemId: string,
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.getMap(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  // Remove item from any other loadouts first
  loadoutsMap.forEach((otherLoadout) => {
    const otherContentsMap = (otherLoadout as Y.Map<any>).get("contents") as Y.Map<any>;
    if (otherContentsMap && otherContentsMap.has(itemId)) {
      otherContentsMap.delete(itemId);
    }
  });

  const contentsMap = loadout.get("contents") as Y.Map<any>;

  const content = new Y.Map();

  contentsMap.set(itemId, content);
}

export async function removeItemFromLoadout(
  workspaceKey: string,
  loadoutId: string,
  itemId: string
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.getMap(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  const contentsMap = loadout.get("contents") as Y.Map<any>;
  contentsMap.delete(itemId);
}

export async function deleteLoadout(workspaceKey: string, loadoutId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const loadoutsMap = doc.getMap("loadouts") as Y.Map<any>;
  loadoutsMap.delete(loadoutId);
}

export async function compareContentsToLoadout(
  workspaceKey: string,
  objectId: string
): Promise<{
  missing: Array<{ id: string; name: string; quantity: number }>;
  extra: Array<{ id: string; name: string; quantity: number }>;
}> {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const object = objectsMap.get(objectId) as Y.Map<any>;
  if (!object) throw new Error("Object not found");

  const selectedLoadoutId = object.get("selectedLoadout") as string | null;
  if (!selectedLoadoutId) {
    return { missing: [], extra: [] };
  }

  try {
    const loadout = await getLoadout(workspaceKey, selectedLoadoutId);
    const objectContents = await getItemContents(workspaceKey, objectId);

    // Create maps for easy comparison
    const loadoutMap = new Map(loadout.contents.map((c) => [c.id, c]));
    const objectMap = new Map(objectContents.map((c) => [c.id, c]));

    const missing: Array<{ id: string; name: string; quantity: number }> = [];
    const extra: Array<{ id: string; name: string; quantity: number }> = [];

    for (const [id, _content] of objectMap) {
      if (!loadoutMap.has(id)) {
        extra.push({
          id,
          name: await lookupItemName(workspaceKey, id),
          quantity: 1
        });
      }
    }

    for (const [id, _content] of loadoutMap) {
      if (!objectMap.has(id)) {
        missing.push({
          id,
          name: await lookupItemName(workspaceKey, id),
          quantity: 1
      })
    }}

    return { missing, extra };
  } catch (error) {
    return { missing: [], extra: [] };
  }
}

const webrtcRetryTimers = new Map<string, number>();

export async function enableWebRTC(
  workspaceKey: string,
  signalingServers: string[] = []
) {
  const doc = await getWorkspaceDoc(workspaceKey);

  // Disconnect any existing provider
  if (peerInstances.has(workspaceKey)) {
    disconnectWebRTC(workspaceKey);
  }

  try {

    // Use room key from local settings, not from synced workspace
    const localPeerId =
      getWorkspaceLocalSettings(workspaceKey).localPeerId || "";

    const remotePeerId =
      getWorkspaceLocalSettings(workspaceKey).syncPeerId || "";

    if (!localPeerId || localPeerId.trim() === "") {
      console.log(
        `Skipping sync for workspace ${workspaceKey}: Local peer ID is empty`
      );
      return null as any;
    }

    // Create PeerJS instance
    const peer = new Peer(localPeerId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });

    // Store peer instance
    peerInstances.set(workspaceKey, peer);

    // On open: connect to room rendezvous point
    peer.on("open", (myPeerId) => {
      if (!remotePeerId || remotePeerId.trim() === "") {
        return;
      }
      connectToPeer(workspaceKey, remotePeerId, myPeerId, peer);
    });

    // On incoming connection: accept and set up sync
    peer.on("connection", (conn) => {
      setupConnection(workspaceKey, conn);
    });

    // Error handling with existing retry logic
    peer.on("error", (err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("PeerJS error:", err);
      scheduleWebRTCRetry(workspaceKey);
    });

    clearWebRTCRetryTimers(workspaceKey);
    console.log(
      `Sync enabled for workspace ${workspaceKey} (room: ${localPeerId})`
    );
    return peer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to enable sync:", error);

    // Schedule retry with exponential backoff
    scheduleWebRTCRetry(workspaceKey);
    throw error;
  }
}

function connectToPeer(
  workspaceKey: string,
  remotePeerId: string,
  myPeerId: string,
  peer: Peer
) {
  // Connect to room rendezvous peer
  const roomConn = peer.connect(remotePeerId);

  // Set up sync
  setupConnection(workspaceKey, roomConn);
}

function setupConnection(workspaceKey: string, conn: DataConnection) {
  // Get workspace doc asynchronously
  getWorkspaceDoc(workspaceKey).then((doc) => {
    // Track this peer as connected
    if (!connectedPeers.has(workspaceKey)) {
      connectedPeers.set(workspaceKey, new Set());
    }
    connectedPeers.get(workspaceKey)!.add(conn.peer);

    let synced = false;

    // Listen for document updates and sync to this peer
    const updateHandler = (update: Uint8Array) => {
      try {
        if (conn.open) {
          console.log(
            `[${workspaceKey}] Sending update to peer ${conn.peer}, size: ${update.length}`
          );
          conn.send({
            type: "sync",
            data: update,
          });
        }
      } catch (error) {
        console.error("Failed to send sync message:", error);
      }
    };

    // Handle incoming messages
    conn.on("data", (msg: any) => {
      console.log(
        `[${workspaceKey}] Received message type: ${msg.type} from peer ${conn.peer}, data type: ${msg.data?.constructor?.name}`
      );

      if (msg.type === "syncReady") {
        try {
          if (doc) {
            console.log(
              `[${workspaceKey}] Peer is ready, sending our full state`
            );
            const stateVector = Y.encodeStateVector(doc);
            console.log(
              `[${workspaceKey}] Sending state vector to peer ${conn.peer}, size: ${stateVector.length}`
            );
            conn.send({
              type: "stateVector",
              data: stateVector,
            });
          }
        } catch (error) {
          console.error("Failed to send state on syncReady:", error);
        }
      }

      if (msg.type === "sync" && msg.data) {
        try {
          if (doc) {
            const data =
              msg.data instanceof Uint8Array
                ? msg.data
                : new Uint8Array(msg.data);
            console.log(
              `[${workspaceKey}] Applying sync update from peer, size: ${data.length}`
            );
            Y.logUpdate(data);
            Y.applyUpdate(doc, data, conn.peer);
            console.log(`[${workspaceKey}] Sync update applied successfully`);
          }
        } catch (error) {
          console.error("Failed to apply sync update:", error);
        }
      }

      if (msg.type === "stateVector" && msg.data) {
        try {
          const stateVector =
            msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data);
          if (doc) {
            console.log(
              `[${workspaceKey}] Received stateVector from peer, encoding response`
            );
            const state = Y.encodeStateAsUpdate(doc, stateVector);
            console.log(
              `[${workspaceKey}] Sending state response, size: ${state.length}`
            );
            conn.send({
              type: "sync",
              data: state,
            });
          }
        } catch (error) {
          console.error("Failed to handle stateVector:", error);
        }
      }
    });

    // On connection, exchange initial state and subscribe to updates
    conn.on("open", () => {
      try {
        if (!doc) {
          console.error("Doc is null during connection open");
          return;
        }

        console.log(
          `[${workspaceKey}] Connection opened with peer ${conn.peer}, subscribing to updates`
        );

        // Subscribe to future updates
        doc.on("update", updateHandler);

        // Send a signal that we're ready to sync
        conn.send({
          type: "syncReady",
        });

        synced = true;
        webrtcRetryStateByWorkspace.set(workspaceKey, { lastRetryCount: 0 });
        console.log(`[${workspaceKey}] Connection ready with peer ${conn.peer}`);
      } catch (error) {
        console.error("Failed to sync initial state:", error);
      }
    });

    conn.on("close", () => {
      // Unsubscribe from updates
      if (synced && doc) {
        doc.off("update", updateHandler);
      }

      // Remove from connected peers
      const peers = connectedPeers.get(workspaceKey);
      if (peers) {
        peers.delete(conn.peer);
      }
    });

    if (!peerConnections.has(workspaceKey)) {
      peerConnections.set(workspaceKey, new Map());
    }
    peerConnections.get(workspaceKey)!.set(conn.peer, conn);
  }).catch((error) => {
    console.error("Failed to setup connection:", error);
    conn.close();
  });
}

export function disconnectWebRTC(workspaceKey: string) {
  // Close all connections
  const connections = peerConnections.get(workspaceKey);
  if (connections) {
    connections.forEach((conn) => {
      try {
        conn.close();
      } catch (error) {
        console.error("Error closing connection:", error);
      }
    });
    peerConnections.delete(workspaceKey);
  }

  // Destroy peer instance
  const peer = peerInstances.get(workspaceKey);
  if (peer) {
    try {
      peer.destroy();
    } catch (error) {
      console.error("Error destroying peer:", error);
    }
    peerInstances.delete(workspaceKey);
  }

  // Clear connected peers tracking
  connectedPeers.delete(workspaceKey);

  clearWebRTCRetryTimers(workspaceKey);
  console.log(`Sync disabled for workspace ${workspaceKey}`);
}

function clearWebRTCRetryTimers(workspaceKey: string) {
  const timer = webrtcRetryTimers.get(workspaceKey);
  if (timer) {
    clearTimeout(timer);
    webrtcRetryTimers.delete(workspaceKey);
  }
}
const webrtcRetryStateByWorkspace = new Map<
  string,
  { lastRetryCount: number }
>();

/**
 * Calculate exponential backoff delay in milliseconds
 * Formula: min(maxDelay, baseDelay * (2 ^ retryCount - 1)) + randomJitter
 */
export function getWebRTCRetryDelay(
  retryCount: number,
  baseDelay = 1000,
  maxDelay = 480000
): number {
  const exponentialDelay = baseDelay * Math.pow(2, Math.max(0, retryCount - 1));
  const cappedDelay = Math.min(maxDelay, exponentialDelay);
  const jitter = Math.random() * 0.1 * cappedDelay; // 0-10% jitter

  return cappedDelay + jitter;
}

function scheduleWebRTCRetry(workspaceKey: string) {
  // Clear any existing retry timer
  clearWebRTCRetryTimers(workspaceKey);

  const retryCount =
    webrtcRetryStateByWorkspace.get(workspaceKey)?.lastRetryCount || 0;
  const delayMs = getWebRTCRetryDelay(retryCount);

  console.log(
    `Scheduling WebRTC retry for ${workspaceKey} in ${Math.round(
      delayMs
    )}ms (attempt ${retryCount})`
  );

  const timer = window.setTimeout(() => {
    webrtcRetryTimers.delete(workspaceKey);
    console.log(
      `Attempting WebRTC reconnect for ${workspaceKey} (attempt ${retryCount})`
    );
    try {
      enableWebRTC(workspaceKey);
    } catch (error) {
      console.error("WebRTC retry failed, will try again:", error);
      // Already scheduled another retry in enableWebRTC
    }
  }, delayMs);

  webrtcRetryTimers.set(workspaceKey, timer);
}

export function getWebRTCStatus(workspaceKey: string): {
  connected: boolean;
  peers: number;
  status: string;
  signalingServer: string;
  retryCount: number;
} {
  const peer = peerInstances.get(workspaceKey);
  const connections = peerConnections.get(workspaceKey);
  const retryCount =
    webrtcRetryStateByWorkspace.get(workspaceKey)?.lastRetryCount || 0;

  if (!peer || !peer.open) {
    return {
      connected: false,
      peers: 0,
      status: "disconnected",
      signalingServer: "cloud.peerjs.com",
      retryCount,
    };
  }

  const peerCount = connections ? connections.size : 0;

  return {
    connected: peer.open,
    peers: peerCount,
    status: peer.open ? "connected to server" : "disconnected",
    signalingServer: "cloud.peerjs.com",
    retryCount,
  };
}

export async function updateWorkspaceLocalPeerId(
  workspaceKey: string,
  newSyncKey: string
) {
  await getWorkspaceDoc(workspaceKey);

  // Save to local settings, not to synced workspace
  setWorkspaceLocalSettingKey(workspaceKey, "localPeerId", newSyncKey);

  // Reconnect with new room
  try {
    disconnectWebRTC(workspaceKey);
    await enableWebRTC(workspaceKey);
  } catch (error) {
    console.error("Failed to reconnect WebRTC after sync key change:", error);
  }
}

export async function updateWorkspaceSyncPeerId(
  workspaceKey: string,
  newSyncKey: string
) {
  await getWorkspaceDoc(workspaceKey);

  // Save to local settings, not to synced workspace
  setWorkspaceLocalSettingKey(workspaceKey, "syncPeerId", newSyncKey);

  // Reconnect with new room
  try {
    disconnectWebRTC(workspaceKey);
    await enableWebRTC(workspaceKey);
  } catch (error) {
    console.error("Failed to reconnect WebRTC after sync key change:", error);
  }
}

export async function updateWorkspaceProperty(
  workspaceKey: string,
  property: string,
  value: any
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const metadataMap = doc.getMap("metadata");

  // Don't sync syncRoomKey through the shared workspace
  if (property === "syncRoomKey") {
    console.warn(
      "Use updateWorkspaceSyncKey() instead of updateWorkspaceProperty() for syncRoomKey"
    );
    return updateWorkspaceSyncPeerId(workspaceKey, value);
  }

  metadataMap.set(property, value);
}

// Amount tracking functions
export async function addAmountUpdate(
  workspaceKey: string,
  itemId: string,
  type: 'set' | 'delta',
  unit: string,
  quantity: number
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  let amountUpdates = item.get("amountUpdates") as Y.Array<any>;
  if (!amountUpdates) {
    amountUpdates = new Y.Array();
    item.set("amountUpdates", amountUpdates);
  }

  const updateEntry = new Y.Map();
  updateEntry.set("id", generateItemId());
  updateEntry.set("type", type);
  updateEntry.set("unit", unit);
  updateEntry.set("quantity", quantity);
  updateEntry.set("timestamp", new Date().toISOString());

  amountUpdates.push([updateEntry]);
}

export async function getAmountUpdates(workspaceKey: string, itemId: string) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  const amountUpdates = item.get("amountUpdates") as Y.Array<any>;
  if (!amountUpdates) return [];

  const updates: Array<{
    id: string;
    type: 'set' | 'delta';
    unit: string;
    quantity: number;
    timestamp: string;
  }> = [];

  amountUpdates.forEach((entry) => {
    const entryMap = entry as Y.Map<any>;
    updates.push({
      id: entryMap.get("id") as string,
      type: entryMap.get("type") as 'set' | 'delta',
      unit: entryMap.get("unit") as string,
      quantity: entryMap.get("quantity") as number,
      timestamp: entryMap.get("timestamp") as string,
    });
  });

  return updates;
}

export async function deleteAmountUpdate(
  workspaceKey: string,
  itemId: string,
  updateId: string
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  const amountUpdates = item.get("amountUpdates") as Y.Array<any>;
  if (!amountUpdates) return;

  for (let i = 0; i < amountUpdates.length; i++) {
    const entry = amountUpdates.get(i) as Y.Map<any>;
    if (entry.get("id") === updateId) {
      amountUpdates.delete(i, 1);
      break;
    }
  }
}

export async function updateAmountUpdate(
  workspaceKey: string,
  itemId: string,
  updateId: string,
  changes: Partial<{ quantity: number; unit: string }>
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  const amountUpdates = item.get("amountUpdates") as Y.Array<any>;
  if (!amountUpdates) return;

  for (let i = 0; i < amountUpdates.length; i++) {
    const entry = amountUpdates.get(i) as Y.Map<any>;
    if (entry.get("id") === updateId) {
      if (changes.quantity !== undefined) {
        entry.set("quantity", changes.quantity);
      }
      if (changes.unit !== undefined) {
        entry.set("unit", changes.unit);
      }
      break;
    }
  }
}

export async function calculateCurrentAmount(workspaceKey: string, itemId: string) {
  try {
    const updates = await getAmountUpdates(workspaceKey, itemId);
    if (updates.length === 0) {
      return { amount: 0, unit: "", error: null };
    }

    // Sort by timestamp
    const sorted = [...updates].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Find most recent 'set' entry
    let baseAmount = 0;
    let baseUnit = "";
    let baseIndex = -1;

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].type === "set") {
        baseAmount = sorted[i].quantity;
        baseUnit = sorted[i].unit;
        baseIndex = i;
        break;
      }
    }

    if (baseIndex === -1 && updates.some((u) => u.type === "delta")) {
      // No 'set', but have deltas - start from 0 with first delta's unit
      baseUnit = sorted.find((u) => u.type === "delta")?.unit || "";
    }

    // Apply deltas after the base
    let currentAmount = baseAmount;
    for (let i = baseIndex + 1; i < sorted.length; i++) {
      const update = sorted[i];

      if (update.type === "delta") {
        if (update.unit !== baseUnit && baseUnit) {
          // Try to convert
          try {
            const converted = convert(update.quantity, update.unit as any).to(baseUnit as any) as unknown as number;
            currentAmount += converted;
          } catch (e) {
            return {
              amount: 0,
              unit: baseUnit,
              error: `Cannot convert ${update.unit} to ${baseUnit}`,
            };
          }
        } else {
          currentAmount += update.quantity;
        }
      }
    }

    return { amount: currentAmount, unit: baseUnit, error: null };
  } catch (error) {
    console.error("Failed to calculate amount:", error);
    return { amount: 0, unit: "", error: "Failed to calculate amount" };
  }
}

export async function updateLastScanned(
  workspaceKey: string,
  itemId: string,
  latitude?: number,
  longitude?: number
) {
  const doc = await getWorkspaceDoc(workspaceKey);
  const objectsMap = doc.getMap("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  item.set("lastScannedAt", new Date().toISOString());
  if (latitude !== undefined && longitude !== undefined) {
    item.set("lastScannedLatitude", latitude);
    item.set("lastScannedLongitude", longitude);
  }
}

export async function exportWorkspaceState(workspaceKey: string): Promise<Uint8Array> {
  const doc = await getWorkspaceDoc(workspaceKey);
  return Y.encodeStateAsUpdate(doc);
}

export async function importWorkspaceState(workspaceKey: string, update: Uint8Array): Promise<void> {
  const doc = await getWorkspaceDoc(workspaceKey);
  Y.applyUpdate(doc, update, "import");
}

export function downloadWorkspaceFile(workspaceKey: string, data: Uint8Array): void {
  const metadata = workspaceRegistry.get(workspaceKey);
  const workspaceName = metadata?.name || "workspace";
  const timestamp = Date.now();
  const filename = `${workspaceName}-${timestamp}.invupd`;

  // Create blob from Uint8Array
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  // Create anchor element and trigger download
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}
