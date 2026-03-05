import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import Peer, { type DataConnection } from "peerjs";
import { generateUUID } from "./uuid.js";
import {
  setWorkspaceLocalSettingKey,
  getWorkspaceLocalSettings,
} from "./local-settings.js";

let yDoc: Y.Doc | null = null;
let workspacesMap: Y.Map<any> | null = null;
let initPromise: Promise<Y.Doc> | null = null;

// Per-workspace peer instance
const peerInstances = new Map<string, Peer>();

// Per-workspace connections: Map of remote peer ID → DataConnection
const peerConnections = new Map<string, Map<string, DataConnection>>();

// Track connected peers per workspace
const connectedPeers = new Map<string, Set<string>>();

export async function initializeYDoc() {
  if (yDoc && workspacesMap) return yDoc;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!yDoc) {
      yDoc = new Y.Doc();

      // Enable IndexedDB persistence for offline support
      const persistence = new IndexeddbPersistence("stuffer-db", yDoc);

      // Wait for persistence to load from IndexedDB
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
    }

    // Initialize workspaces map (do this after persistence is loaded)
    if (!workspacesMap) {
      workspacesMap = yDoc.getMap("workspaces");
    }

    return yDoc;
  })();

  const result = await initPromise;
  // Ensure workspacesMap is set before returning
  if (!workspacesMap) {
    workspacesMap = yDoc!.getMap("workspaces");
  }
  return result;
}

export function getYDoc(): Y.Doc {
  if (!yDoc) throw new Error("YDoc not initialized");
  return yDoc;
}

export function getWorkspacesMap(): Y.Map<any> {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");
  return workspacesMap;
}

export function createWorkspace(name: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspaceKey = `workspace-${Date.now()}`;
  const workspace = new Y.Map();

  workspace.set("name", name);
  workspace.set("syncRoomKey", workspaceKey);
  workspace.set("objects", new Y.Map());
  workspace.set("loadouts", new Y.Map());

  workspacesMap.set(workspaceKey, workspace);

  return workspaceKey;
}

export function getWorkspace(key: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");
  return workspacesMap.get(key);
}

export function deleteWorkspace(key: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");
  workspacesMap.delete(key);
}

export function addItem(
  workspaceKey: string,
  itemName: string,
  qrData?: string
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const itemId = generateUUID();

  const item = new Y.Map();
  item.set("name", itemName);
  item.set("qrData", qrData || null);
  item.set("createdAt", new Date().toISOString());
  item.set("title", itemName);
  item.set("description", "");
  item.set("contents", new Y.Map());

  objectsMap.set(itemId, item);
  return itemId;
}

export function getItems(workspaceKey: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const items: Array<{
    id: string;
    name: string;
    qrData?: string;
    createdAt: string;
  }> = [];

  objectsMap.forEach((item, id) => {
    items.push({
      id,
      name: item.get("name") as string,
      qrData: item.get("qrData") as string | undefined,
      createdAt: item.get("createdAt") as string,
    });
  });

  return items;
}

export function findItemByQR(workspaceKey: string, qrData: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;

  for (const [id, item] of objectsMap) {
    if ((item as Y.Map<any>).get("qrData") === qrData) {
      return {
        id,
        name: (item as Y.Map<any>).get("name") as string,
      };
    }
  }

  // Check if QR data itself is a valid UUID format (matches an item ID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(qrData) && objectsMap.has(qrData)) {
    const item = objectsMap.get(qrData) as Y.Map<any>;
    return {
      id: qrData,
      name: item.get("name") as string,
    };
  }

  return null;
}

export function deleteItem(workspaceKey: string, itemId: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  objectsMap.delete(itemId);
}

export function getItem(workspaceKey: string, itemId: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  return {
    id: itemId,
    name: item.get("name") as string,
    title: item.get("title") as string,
    description: item.get("description") as string,
    qrData: item.get("qrData") as string | undefined,
    createdAt: item.get("createdAt") as string,
    imageData: item.get("imageData") as string | undefined,
    selectedLoadout: item.get("selectedLoadout") as string | null,
  };
}

export function updateItemProperty(
  workspaceKey: string,
  itemId: string,
  property: string,
  value: any
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  item.set(property, value);
}

export function getItemContents(workspaceKey: string, itemId: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const item = objectsMap.get(itemId) as Y.Map<any>;
  if (!item) throw new Error("Item not found");

  let contentsMap = item.get("contents") as Y.Map<any>;

  // Initialize contents map if it doesn't exist (for items created before this feature)
  if (!contentsMap) {
    contentsMap = new Y.Map();
    item.set("contents", contentsMap);
  }

  const contents: Array<{ id: string; name: string; quantity: number }> = [];

  contentsMap.forEach((content, id) => {
    contents.push({
      id,
      name: content.get("name") as string,
      quantity: content.get("quantity") as number,
    });
  });

  return contents;
}

export function addItemToContents(
  workspaceKey: string,
  containerId: string,
  itemId: string,
  itemName: string,
  quantity: number = 1
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const container = objectsMap.get(containerId) as Y.Map<any>;
  if (!container) throw new Error("Container not found");

  const contentsMap = container.get("contents") as Y.Map<any>;

  const content = new Y.Map();
  content.set("name", itemName);
  content.set("quantity", quantity);

  contentsMap.set(itemId, content);
}

export function removeItemFromContents(
  workspaceKey: string,
  containerId: string,
  contentItemId: string
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const container = objectsMap.get(containerId) as Y.Map<any>;
  if (!container) throw new Error("Container not found");

  const contentsMap = container.get("contents") as Y.Map<any>;
  contentsMap.delete(contentItemId);
}

export function createLoadout(
  workspaceKey: string,
  title: string,
  description: string = "",
  contents: Array<{ itemId: string; itemName: string; quantity: number }> = []
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  const loadoutId = generateUUID();

  const loadout = new Y.Map();
  loadout.set("title", title);
  loadout.set("description", description);
  loadout.set("createdAt", new Date().toISOString());

  const loadoutContents = new Y.Map();
  contents.forEach(({ itemId, itemName, quantity }) => {
    const content = new Y.Map();
    content.set("name", itemName);
    content.set("quantity", quantity);
    loadoutContents.set(itemId, content);
  });

  loadout.set("contents", loadoutContents);
  loadoutsMap.set(loadoutId, loadout);

  return loadoutId;
}

export function saveObjectAsLoadout(
  workspaceKey: string,
  objectId: string,
  title: string,
  description: string = ""
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const object = objectsMap.get(objectId) as Y.Map<any>;
  if (!object) throw new Error("Object not found");

  const objectContents = getItemContents(workspaceKey, objectId);
  return createLoadout(
    workspaceKey,
    title,
    description,
    objectContents.map((c) => ({
      itemId: c.id,
      itemName: c.name,
      quantity: c.quantity,
    }))
  );
}

export function getLoadouts(workspaceKey: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
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

export function getLoadout(workspaceKey: string, loadoutId: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.get(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  const contentsMap = loadout.get("contents") as Y.Map<any>;
  const contents: Array<{ id: string; name: string; quantity: number }> = [];

  contentsMap.forEach((content, id) => {
    contents.push({
      id,
      name: (content as Y.Map<any>).get("name") as string,
      quantity: (content as Y.Map<any>).get("quantity") as number,
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

export function updateLoadoutProperty(
  workspaceKey: string,
  loadoutId: string,
  property: string,
  value: any
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.get(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  loadout.set(property, value);
}

export function addItemToLoadout(
  workspaceKey: string,
  loadoutId: string,
  itemId: string,
  itemName: string,
  quantity: number = 1
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.get(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  const contentsMap = loadout.get("contents") as Y.Map<any>;

  const content = new Y.Map();
  content.set("name", itemName);
  content.set("quantity", quantity);

  contentsMap.set(itemId, content);
}

export function removeItemFromLoadout(
  workspaceKey: string,
  loadoutId: string,
  itemId: string
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  const loadout = loadoutsMap.get(loadoutId) as Y.Map<any>;
  if (!loadout) throw new Error("Loadout not found");

  const contentsMap = loadout.get("contents") as Y.Map<any>;
  contentsMap.delete(itemId);
}

export function deleteLoadout(workspaceKey: string, loadoutId: string) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const loadoutsMap = workspace.get("loadouts") as Y.Map<any>;
  loadoutsMap.delete(loadoutId);
}

export function compareContentsToLoadout(
  workspaceKey: string,
  objectId: string
): {
  missing: Array<{ id: string; name: string; quantity: number }>;
  extra: Array<{ id: string; name: string; quantity: number }>;
} {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  const objectsMap = workspace.get("objects") as Y.Map<any>;
  const object = objectsMap.get(objectId) as Y.Map<any>;
  if (!object) throw new Error("Object not found");

  const selectedLoadoutId = object.get("selectedLoadout") as string | null;
  if (!selectedLoadoutId) {
    return { missing: [], extra: [] };
  }

  try {
    const loadout = getLoadout(workspaceKey, selectedLoadoutId);
    const objectContents = getItemContents(workspaceKey, objectId);

    // Create maps for easy comparison
    const loadoutMap = new Map(loadout.contents.map((c) => [c.id, c]));
    const objectMap = new Map(objectContents.map((c) => [c.id, c]));

    const missing = loadout.contents.filter((item) => !objectMap.has(item.id));
    const extra = objectContents.filter((item) => !loadoutMap.has(item.id));

    return { missing, extra };
  } catch (error) {
    return { missing: [], extra: [] };
  }
}

const webrtcRetryTimers = new Map<string, number>();

export function enableWebRTC(
  workspaceKey: string,
  signalingServers: string[] = []
) {
  if (!yDoc) throw new Error("YDoc not initialized");
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  // Disconnect any existing provider
  if (peerInstances.has(workspaceKey)) {
    disconnectWebRTC(workspaceKey);
  }

  try {
    const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
    if (!workspace) throw new Error("Workspace not found");

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
  if (!yDoc) {
    console.error("YDoc not initialized for sync");
    conn.close();
    return;
  }

  // Track this peer as connected
  if (!connectedPeers.has(workspaceKey)) {
    connectedPeers.set(workspaceKey, new Set());
  }
  connectedPeers.get(workspaceKey)!.add(conn.peer);

  let synced = false;

  // Listen for document updates and sync to this peer
  const updateHandler = (update: Uint8Array) => {
    try {
      conn.send({
        type: "sync",
        data: update,
      });
    } catch (error) {
      console.error("Failed to send sync message:", error);
    }
  };

  // Handle incoming messages
  conn.on("data", (msg: any) => {
    if (msg.type === "sync" && msg.data instanceof ArrayBuffer) {
      try {
        if (yDoc) {
          Y.applyUpdate(yDoc, new Uint8Array(msg.data));
        }
      } catch (error) {
        console.error("Failed to apply sync update:", error);
      }
    }

    if (msg.type === "stateVector") {
      const stateVector = new Uint8Array(msg.data);
      if (yDoc) {
        const state = Y.encodeStateAsUpdate(yDoc, stateVector);
        conn.send({
          type: "sync",
          data: state,
        });
      }
    }
  });

  // On connection, send full state and subscribe to updates
  conn.on("open", () => {
    try {
      if (!yDoc) {
        console.error("YDoc is null during connection open");
        return;
      }

      // Subscribe to future updates
      yDoc.on("update", updateHandler);

      if (yDoc) {
        conn.send({
          type: "stateVector",
          data: Y.encodeStateVector(yDoc),
        });
      }
      synced = true;
      webrtcRetryStateByWorkspace.set(workspaceKey, { lastRetryCount: 0 });
    } catch (error) {
      console.error("Failed to sync initial state:", error);
    }
  });

  conn.on("close", () => {
    // Unsubscribe from updates
    if (synced) {
      yDoc.off("update", updateHandler);
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

export function updateWorkspaceLocalPeerId(
  workspaceKey: string,
  newSyncKey: string
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  // Save to local settings, not to synced workspace
  setWorkspaceLocalSettingKey(workspaceKey, "localPeerId", newSyncKey);

  // Reconnect with new room
  try {
    disconnectWebRTC(workspaceKey);
    enableWebRTC(workspaceKey);
  } catch (error) {
    console.error("Failed to reconnect WebRTC after sync key change:", error);
  }
}

export function updateWorkspaceSyncPeerId(
  workspaceKey: string,
  newSyncKey: string
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  // Save to local settings, not to synced workspace
  setWorkspaceLocalSettingKey(workspaceKey, "syncPeerId", newSyncKey);

  // Reconnect with new room
  try {
    disconnectWebRTC(workspaceKey);
    enableWebRTC(workspaceKey);
  } catch (error) {
    console.error("Failed to reconnect WebRTC after sync key change:", error);
  }
}

export function updateWorkspaceProperty(
  workspaceKey: string,
  property: string,
  value: any
) {
  if (!workspacesMap) throw new Error("Workspaces map not initialized");

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error("Workspace not found");

  // Don't sync syncRoomKey through the shared workspace
  if (property === "syncRoomKey") {
    console.warn(
      "Use updateWorkspaceSyncKey() instead of updateWorkspaceProperty() for syncRoomKey"
    );
    return updateWorkspaceSyncPeerId(workspaceKey, value);
  }

  workspace.set(property, value);
}
