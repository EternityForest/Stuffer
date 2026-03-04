import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getWorkspace, getWebRTCStatus, updateWorkspaceSyncKey, enableWebRTC, disconnectWebRTC } from '../services/storage.js';
import { getSyncRoomKey } from '../services/local-settings.js';

@customElement('workspace-settings')
export class WorkspaceSettings extends LitElement {
  static createRenderRoot() {
    return this;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
    }

    .header {
      padding: 1rem;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    h2 {
      margin: 0;
      font-size: 1.3rem;
    }

    button {
      padding: 0.5rem 1rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
    }

    button:hover {
      background-color: #0056b3;
    }

    button.danger {
      background-color: #dc3545;
    }

    button.danger:hover {
      background-color: #c82333;
    }

    .content {
      padding: 2rem;
      flex: 1;
      max-width: 600px;
      margin: 0 auto;
    }

    .section {
      margin-bottom: 2rem;
      padding: 1rem;
      background-color: #f8f9fa;
      border-radius: 4px;
      border-left: 4px solid #007bff;
    }

    .section h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #333;
    }

    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.95rem;
      font-family: 'Courier New', monospace;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: #007bff;
      box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
    }

    .readonly {
      background-color: #e9ecef;
      cursor: default;
    }

    .status-display {
      padding: 1rem;
      background-color: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 1rem;
    }

    .status-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .status-line:last-child {
      margin-bottom: 0;
    }

    .status-label {
      font-weight: 500;
      color: #666;
    }

    .status-value {
      font-weight: 600;
      color: #333;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      background-color: #f8f9fa;
      border-radius: 20px;
      font-size: 0.9rem;
    }

    .status-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .status-dot.connected {
      background-color: #28a745;
    }

    .status-dot.disconnected {
      background-color: #999;
    }

    .status-dot.connecting {
      background-color: #ffc107;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .button-group {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .button-group button {
      flex: 1;
    }

    .back-button {
      background-color: #6c757d;
    }

    .back-button:hover {
      background-color: #5a6268;
    }

    .warning {
      padding: 0.75rem;
      background-color: #fff3cd;
      color: #856404;
      border: 1px solid #ffeaa7;
      border-radius: 4px;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }

    .info {
      padding: 0.75rem;
      background-color: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
      border-radius: 4px;
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
  `;

  @property()
  declare workspaceKey: string;

  @state()
  declare workspaceName: string;

  @state()
  declare syncKey: string;

  @state()
  declare editingSyncKey: boolean;

  @state()
  declare newSyncKey: string;

  @state()
  declare connected: boolean;

  @state()
  declare peerCount: number;

  @state()
  declare status: 'connected' | 'disconnected' | 'connecting';

  @state()
  declare signalingServer: string;

  @state()
  declare error: string | null;

  private statusInterval: number | null = null;

  constructor() {
    super();
    this.workspaceKey = '';
    this.workspaceName = '';
    this.syncKey = '';
    this.editingSyncKey = false;
    this.newSyncKey = '';
    this.connected = false;
    this.peerCount = 0;
    this.status = 'disconnected';
    this.signalingServer = 'wss://y-webrtc-ckynwnzncc.now.sh';
    this.error = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadWorkspaceData();
    this.startStatusPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }

  private loadWorkspaceData() {
    if (!this.workspaceKey) return;

    try {
      const workspace = getWorkspace(this.workspaceKey);
      if (workspace) {
        this.workspaceName = (workspace as any).get('name') as string;
        // Get sync key from local settings, not from synced workspace
        this.syncKey = getSyncRoomKey(this.workspaceKey);
        this.newSyncKey = this.syncKey;
      }
    } catch (error) {
      console.error('Failed to load workspace data:', error);
      this.error = 'Failed to load workspace data';
    }
  }

  private startStatusPolling() {
    this.updateStatus();
    this.statusInterval = window.setInterval(() => {
      this.updateStatus();
    }, 2000);
  }

  private updateStatus() {
    if (!this.workspaceKey) return;

    try {
      const status = getWebRTCStatus(this.workspaceKey);
      this.connected = status.connected;
      this.peerCount = status.peers;
      this.status = status.connected ? 'connected' : 'disconnected';
      this.signalingServer = status.signalingServer;
    } catch (error) {
      console.error('Failed to update WebRTC status:', error);
    }
  }

  private startEditSyncKey() {
    this.editingSyncKey = true;
    this.newSyncKey = this.syncKey;
  }

  private cancelEditSyncKey() {
    this.editingSyncKey = false;
    this.newSyncKey = this.syncKey;
  }

  private updateSyncKey() {
    if (!this.workspaceKey || !this.newSyncKey.trim()) {
      this.error = 'Sync key cannot be empty';
      return;
    }

    if (this.newSyncKey === this.syncKey) {
      this.editingSyncKey = false;
      return;
    }

    try {
      updateWorkspaceSyncKey(this.workspaceKey, this.newSyncKey);
      this.syncKey = this.newSyncKey;
      this.editingSyncKey = false;
      this.error = null;
    } catch (error) {
      console.error('Failed to update sync key:', error);
      this.error = 'Failed to update sync key';
    }
  }

  private disconnect() {
    if (!this.workspaceKey) return;

    try {
      disconnectWebRTC(this.workspaceKey);
      this.updateStatus();
    } catch (error) {
      console.error('Failed to disconnect WebRTC:', error);
      this.error = 'Failed to disconnect';
    }
  }

  private reconnect() {
    if (!this.workspaceKey) return;

    if (!this.syncKey || this.syncKey.trim() === '') {
      this.error = 'Cannot reconnect: Sync key is empty';
      return;
    }

    try {
      enableWebRTC(this.workspaceKey);
      setTimeout(() => this.updateStatus(), 500);
    } catch (error) {
      console.error('Failed to reconnect WebRTC:', error);
      this.error = 'Failed to reconnect';
    }
  }

  private goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'workspace-browser' },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const statusText = this.status === 'connected' ? 'Connected' :
                       this.status === 'connecting' ? 'Connecting' :
                       'Disconnected';

    return html`
      <div class="header">
        <h2>Settings</h2>
        <button class="back-button" @click=${() => this.goBack()}>Back</button>
      </div>

      <div class="content">
        ${this.error ? html`
          <div class="warning">${this.error}</div>
        ` : ''}

        <div class="section">
          <h3>Workspace Information</h3>
          <div class="form-group">
            <label>Workspace Name</label>
            <input type="text" class="readonly" .value=${this.workspaceName} readonly />
          </div>
        </div>

        <div class="section">
          <h3>Sync Configuration</h3>
          ${this.editingSyncKey ? html`
            <div class="form-group">
              <label>Sync Key</label>
              <input
                type="text"
                .value=${this.newSyncKey}
                @input=${(e: Event) => { this.newSyncKey = (e.target as HTMLInputElement).value; }}
                placeholder="Enter new sync key"
              />
              <div class="info">
                Changing the sync key will disconnect from current peers and connect to a new room.
              </div>
              <div class="button-group">
                <button @click=${() => this.updateSyncKey()}>Save Key</button>
                <button class="danger" @click=${() => this.cancelEditSyncKey()}>Cancel</button>
              </div>
            </div>
          ` : html`
            <div class="form-group">
              <label>Sync Key</label>
              <input type="text" class="readonly" .value=${this.syncKey} readonly />
              <button @click=${() => this.startEditSyncKey()} style="margin-top: 0.5rem; width: 100%;">Edit Sync Key</button>
            </div>
          `}
        </div>

        <div class="section">
          <h3>Connection Status</h3>
          <div class="status-display">
            <div class="status-line">
              <span class="status-label">Status:</span>
              <span class="status-indicator">
                <span class="status-dot ${this.status}"></span>
                <span class="status-value">${statusText}</span>
              </span>
            </div>
            <div class="status-line">
              <span class="status-label">Connected Peers:</span>
              <span class="status-value">${this.peerCount}</span>
            </div>
            <div class="status-line">
              <span class="status-label">Signaling Server:</span>
              <span class="status-value" style="font-family: monospace; font-size: 0.85rem;">${this.signalingServer}</span>
            </div>
          </div>

          <div class="button-group">
            ${this.connected ? html`
              <button class="danger" @click=${() => this.disconnect()}>Disconnect</button>
            ` : html`
              <button @click=${() => this.reconnect()}>Reconnect</button>
            `}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'workspace-settings': WorkspaceSettings;
  }
}
