/**
 * Local browser-only settings storage (not synced via peer-to-peer)
 * Stores per-workspace configuration like sync room keys and connection status
 */

interface WorkspaceLocalSettings {
  // Legacy: single sync peer ID (for backward compatibility - deprecated)
  syncPeerId?: string;
  localPeerId?: string;
  // List of sync keys for P2PT sync
  syncKeys?: string[];
}

const STORAGE_KEY = 'stuffer:workspace-settings';

function getLocalSettings(): Map<string, WorkspaceLocalSettings> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return new Map();

  try {
    const data = JSON.parse(stored);
    return new Map(Object.entries(data));
  } catch (error) {
    console.error('Failed to parse local settings:', error);
    return new Map();
  }
}

function saveLocalSettings(settings: Map<string, WorkspaceLocalSettings>) {
  try {
    const data = Object.fromEntries(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save local settings:', error);
  }
}

export function getWorkspaceLocalSettings(workspaceKey: string): WorkspaceLocalSettings {
  const settings = getLocalSettings();
  return settings.get(workspaceKey) || {};
}

export function setWorkspaceLocalSettings(workspaceKey: string, settings: Partial<WorkspaceLocalSettings>) {
  const allSettings = getLocalSettings();
  const current = allSettings.get(workspaceKey) || {};
  allSettings.set(workspaceKey, { ...current, ...settings });
  saveLocalSettings(allSettings);
}

export function setWorkspaceLocalSettingKey(workspaceKey: string, key: string, value: any) {
  setWorkspaceLocalSettings(workspaceKey, { [key]: value });
}

// Sync keys management
export function getSyncKeys(workspaceKey: string): string[] {
  const settings = getWorkspaceLocalSettings(workspaceKey);
  return settings.syncKeys || [];
}

export function addSyncKey(workspaceKey: string, syncKey: string): void {
  const settings = getLocalSettings();
  const current = settings.get(workspaceKey) || {};
  const keys = current.syncKeys || [];

  if (!keys.includes(syncKey)) {
    keys.push(syncKey);
    settings.set(workspaceKey, { ...current, syncKeys: keys });
    saveLocalSettings(settings);
  }
}

export function removeSyncKey(workspaceKey: string, syncKey: string): void {
  const settings = getLocalSettings();
  const current = settings.get(workspaceKey) || {};
  const keys = current.syncKeys || [];

  const index = keys.indexOf(syncKey);
  if (index > -1) {
    keys.splice(index, 1);
    settings.set(workspaceKey, { ...current, syncKeys: keys });
    saveLocalSettings(settings);
  }
}

export function clearSyncKeys(workspaceKey: string): void {
  const settings = getLocalSettings();
  const current = settings.get(workspaceKey) || {};
  settings.set(workspaceKey, { ...current, syncKeys: [] });
  saveLocalSettings(settings);
}