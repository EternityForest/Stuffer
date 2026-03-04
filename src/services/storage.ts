import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

let yDoc: Y.Doc | null = null;
let workspacesMap: Y.Map<any> | null = null;
let initPromise: Promise<Y.Doc> | null = null;

export async function initializeYDoc() {
  if (yDoc && workspacesMap) return yDoc;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!yDoc) {
      yDoc = new Y.Doc();

      // Enable IndexedDB persistence for offline support
      const persistence = new IndexeddbPersistence('stuffer-db', yDoc);

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
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Initialize workspaces map (do this after persistence is loaded)
    if (!workspacesMap) {
      workspacesMap = yDoc.getMap('workspaces');
    }

    return yDoc;
  })();

  const result = await initPromise;
  // Ensure workspacesMap is set before returning
  if (!workspacesMap) {
    workspacesMap = yDoc!.getMap('workspaces');
  }
  return result;
}

export function getYDoc(): Y.Doc {
  if (!yDoc) throw new Error('YDoc not initialized');
  return yDoc;
}

export function getWorkspacesMap(): Y.Map<any> {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');
  return workspacesMap;
}

export function createWorkspace(name: string, syncRoomKey?: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');

  const workspaceKey = syncRoomKey || `workspace-${Date.now()}`;
  const workspace = new Y.Map();

  workspace.set('name', name);
  workspace.set('syncRoomKey', workspaceKey);
  workspace.set('objects', new Y.Map());
  workspace.set('loadouts', new Y.Map());

  workspacesMap.set(workspaceKey, workspace);

  return workspaceKey;
}

export function getWorkspace(key: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');
  return workspacesMap.get(key);
}

export function deleteWorkspace(key: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');
  workspacesMap.delete(key);
}

export function addItem(workspaceKey: string, itemName: string, qrData?: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error('Workspace not found');

  const objectsMap = workspace.get('objects') as Y.Map<any>;
  const itemId = generateUUID();

  const item = new Y.Map();
  item.set('name', itemName);
  item.set('qrData', qrData || null);
  item.set('createdAt', new Date().toISOString());

  objectsMap.set(itemId, item);
  return itemId;
}

export function getItems(workspaceKey: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error('Workspace not found');

  const objectsMap = workspace.get('objects') as Y.Map<any>;
  const items: Array<{ id: string; name: string; qrData?: string; createdAt: string }> = [];

  objectsMap.forEach((item, id) => {
    items.push({
      id,
      name: item.get('name') as string,
      qrData: item.get('qrData') as string | undefined,
      createdAt: item.get('createdAt') as string,
    });
  });

  return items;
}

export function deleteItem(workspaceKey: string, itemId: string) {
  if (!workspacesMap) throw new Error('Workspaces map not initialized');

  const workspace = workspacesMap.get(workspaceKey) as Y.Map<any>;
  if (!workspace) throw new Error('Workspace not found');

  const objectsMap = workspace.get('objects') as Y.Map<any>;
  objectsMap.delete(itemId);
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function enableWebRTC(roomName: string, signalingServers: string[] = []) {
  if (!yDoc) throw new Error('YDoc not initialized');

  // WebRTC sync setup will be implemented when needed
  // For now, IndexedDB persistence provides offline support
  console.log('WebRTC sync for room:', roomName);

  return {
    connect: () => console.log('WebRTC connected'),
    disconnect: () => console.log('WebRTC disconnected'),
  };
}
