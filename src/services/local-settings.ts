/**
 * Local browser-only settings storage (not synced via WebRTC)
 * Stores per-workspace configuration like sync room keys and WebRTC status
 */

interface WorkspaceLocalSettings {
  syncRoomKey?: string;
  signalingServers?: string[];
  lastWebRTCConnectionTime?: number;
  webrtcRetryCount?: number;
  webrtcLastError?: string;
}

const STORAGE_KEY = 'stuffer:workspace-settings';
const DEFAULT_SIGNALING_SERVERS = ['wss://signaling.yjs.dev', 'wss://y-webrtc-ckynwnzncc.now.sh'];

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

export function getSyncRoomKey(workspaceKey: string): string {
  const settings = getWorkspaceLocalSettings(workspaceKey);
  return settings.syncRoomKey || workspaceKey;
}

export function setSyncRoomKey(workspaceKey: string, roomKey: string) {
  setWorkspaceLocalSettings(workspaceKey, { syncRoomKey: roomKey });
}

export function getSignalingServers(workspaceKey: string): string[] {
  const settings = getWorkspaceLocalSettings(workspaceKey);
  return settings.signalingServers || DEFAULT_SIGNALING_SERVERS;
}

export function setSignalingServers(workspaceKey: string, servers: string[]) {
  setWorkspaceLocalSettings(workspaceKey, { signalingServers: servers });
}

export function recordWebRTCConnectionAttempt(workspaceKey: string) {
  const settings = getWorkspaceLocalSettings(workspaceKey);
  const retryCount = (settings.webrtcRetryCount || 0) + 1;

  setWorkspaceLocalSettings(workspaceKey, {
    lastWebRTCConnectionTime: Date.now(),
    webrtcRetryCount: retryCount,
    webrtcLastError: undefined,
  });

  return retryCount;
}

export function recordWebRTCError(workspaceKey: string, error: string) {
  setWorkspaceLocalSettings(workspaceKey, {
    webrtcLastError: error,
  });
}

export function clearWebRTCRetryCount(workspaceKey: string) {
  setWorkspaceLocalSettings(workspaceKey, {
    webrtcRetryCount: 0,
    webrtcLastError: undefined,
  });
}

/**
 * Calculate exponential backoff delay in milliseconds
 * Formula: min(maxDelay, baseDelay * (2 ^ retryCount - 1)) + randomJitter
 */
export function getWebRTCRetryDelay(retryCount: number, baseDelay = 1000, maxDelay = 30000): number {
  const exponentialDelay = baseDelay * Math.pow(2, Math.max(0, retryCount - 1));
  const cappedDelay = Math.min(maxDelay, exponentialDelay);
  const jitter = Math.random() * 0.1 * cappedDelay; // 0-10% jitter

  return cappedDelay + jitter;
}

export function getWebRTCRetryCount(workspaceKey: string): number {
  const settings = getWorkspaceLocalSettings(workspaceKey);
  return settings.webrtcRetryCount || 0;
}
