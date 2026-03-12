import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getWorkspaceSyncedMetadata,
  getWebRTCStatus,
  updateWorkspaceSyncPeerId,
  enableWebRTC,
  disconnectWebRTC,
  updateWorkspaceLocalPeerId,
  exportWorkspaceState,
  importWorkspaceState,
  downloadWorkspaceFile,
  createCategory,
  deleteCategory,
  getCategories,
  getDefaultCategory,
  setDefaultCategory,
} from "../services/storage.js";
import { getWorkspaceLocalSettings } from "../services/local-settings.js";
import { generateUUID } from "../utils/uuid.js";
import QRCode from "qrcode";
import jsQR from "jsqr";

@customElement("workspace-settings")
export class WorkspaceSettings extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property()
  declare workspaceKey: string;

  @state()
  declare workspaceName: string;

  @state()
  declare syncToPeer: string;

  @state()
  declare localPeerId: string;

  @state()
  declare editingsyncToPeer: boolean;

  @state()
  declare newsyncToPeer: string;

  @state()
  declare connected: boolean;

  @state()
  declare peerCount: number;

  @state()
  declare status: "connected" | "disconnected" | "connecting";

  @state()
  declare signalingServer: string;

  @state()
  declare error: string | null;

  @state()
  declare importSuccess: string | null;

  @state()
  declare categories: Array<{ id: string; name: string }>;

  @state()
  declare newCategoryName: string;

  @state()
  declare showCategoryForm: boolean;

  @state()
  declare defaultCategory: string;

  @state()
  declare qrCodeDataUrl: string | null;

  @state()
  declare showScanSync: boolean;

  @state()
  declare isScanningForSync: boolean;

  private statusInterval: number | null = null;
  private fileInput: HTMLInputElement | null = null;
  private boundScanSyncEvent: EventListener | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private scanningAnimation: number | null = null;

  constructor() {
    super();
    this.workspaceKey = "";
    this.workspaceName = "";
    this.syncToPeer = "";
    this.localPeerId = "";
    this.editingsyncToPeer = false;
    this.newsyncToPeer = "";
    this.connected = false;
    this.peerCount = 0;
    this.status = "disconnected";
    this.signalingServer = "wss://y-webrtc-ckynwnzncc.now.sh";
    this.error = null;
    this.importSuccess = null;
    this.categories = [];
    this.newCategoryName = "";
    this.showCategoryForm = false;
    this.defaultCategory = "all";
    this.qrCodeDataUrl = null;
    this.showScanSync = false;
    this.isScanningForSync = false;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadWorkspaceData();
    await this.loadCategories();
    await this.loadDefaultCategory();
    await this.generateQRCode();
    this.startStatusPolling();

    // Listen for scanned sync peer ID
    this.boundScanSyncEvent = this.handleScanSyncEvent.bind(
      this
    ) as EventListener;
    globalThis.addEventListener("globalTagScan", this.boundScanSyncEvent);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    if (this.boundScanSyncEvent) {
      globalThis.removeEventListener("globalTagScan", this.boundScanSyncEvent);
    }
    this.stopScanningForSync();
  }

  private async generateQRCode() {
    if (!this.localPeerId) return;

    try {
      this.qrCodeDataUrl = await QRCode.toDataURL(this.localPeerId, {
        width: 200,
        errorCorrectionLevel: "H",
        type: "image/png",
      });
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
  }

  private handleScanSyncEvent(event: Event) {
    const customEvent = event as CustomEvent<{ qrData: string }>;
    const scannedData = customEvent.detail.qrData;

    // If this is an NFC tag, it will have "nfc-id://" prefix, use raw data
    // Otherwise it's a QR code with the peer ID
    const peerId = scannedData.replace("nfc-id://", "");

    this.newsyncToPeer = peerId;
    this.showScanSync = false;
  }

  private startScanForSync() {
    this.isScanningForSync = true;
  }

  private stopScanningForSync() {
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    if (this.scanningAnimation) {
      cancelAnimationFrame(this.scanningAnimation);
      this.scanningAnimation = null;
    }

    this.isScanningForSync = false;
  }

  private async beginScanForSync() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.videoElement = this.querySelector(
        "#sync-camera-video"
      ) as HTMLVideoElement;
      this.canvasElement = this.querySelector(
        "#sync-scan-canvas"
      ) as HTMLCanvasElement;

      if (this.videoElement) {
        this.videoElement.srcObject = stream;

        const playPromise = this.videoElement.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.scanForSyncQR();
            })
            .catch((error) => {
              console.error("Error playing video:", error);
            });
        } else {
          this.scanForSyncQR();
        }
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      this.stopScanningForSync();
    }
  }

  private scanForSyncQR() {
    if (!this.isScanningForSync || !this.videoElement || !this.canvasElement)
      return;

    const ctx = this.canvasElement.getContext("2d");
    if (!ctx) return;

    this.canvasElement.width = this.videoElement.videoWidth;
    this.canvasElement.height = this.videoElement.videoHeight;

    ctx.drawImage(this.videoElement, 0, 0);

    const imageData = ctx.getImageData(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      this.syncToPeer = code.data;
      updateWorkspaceSyncPeerId(this.workspaceKey, code.data).then(() => {
        this.requestUpdate();
      });

      this.stopScanningForSync();
    } else {
      this.scanningAnimation = requestAnimationFrame(() =>
        this.scanForSyncQR()
      );
    }
  }

  private async loadWorkspaceData() {
    if (!this.workspaceKey) return;

    try {
      const workspace = await getWorkspaceSyncedMetadata(this.workspaceKey);
      if (workspace) {
        this.workspaceName = (workspace as any).get("name") as string;
        // Get sync key from local settings, not from synced workspace
        this.syncToPeer =
          getWorkspaceLocalSettings(this.workspaceKey).syncPeerId || "";
        this.localPeerId =
          getWorkspaceLocalSettings(this.workspaceKey).localPeerId || "";
        this.newsyncToPeer = this.syncToPeer;
        await this.generateQRCode();
      }
    } catch (error) {
      console.error("Failed to load workspace data:", error);
      this.error = "Failed to load workspace data";
    }
  }

  private async loadCategories() {
    if (!this.workspaceKey) return;

    try {
      this.categories = await getCategories(this.workspaceKey);
    } catch (error) {
      console.error("Failed to load categories:", error);
      this.categories = [];
    }
  }

  private async loadDefaultCategory() {
    if (!this.workspaceKey) return;

    try {
      this.defaultCategory = await getDefaultCategory(this.workspaceKey);
    } catch (error) {
      console.error("Failed to load default category:", error);
      this.defaultCategory = "all";
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
      this.status = status.connected ? "connected" : "disconnected";
      this.signalingServer = status.signalingServer;
    } catch (error) {
      console.error("Failed to update WebRTC status:", error);
    }
  }

  private async startRegenLocalKey() {
    if (confirm("Are you sure you want to regenerate the local sync key?")) {
      try {
        const uuid = generateUUID();
        await updateWorkspaceLocalPeerId(this.workspaceKey, uuid);
        await this.loadWorkspaceData();
        await this.generateQRCode();
      } catch (error) {
        console.error("Failed to regenerate local sync key:", error);
        this.error = "Failed to regenerate local sync key";
      }
    }
  }

  private async startClearLocalKey() {
    if (confirm("Are you sure you want to clear the local sync key?")) {
      try {
        await updateWorkspaceLocalPeerId(this.workspaceKey, "");
        await this.loadWorkspaceData();
      } catch (error) {
        console.error("Failed to clear local sync key:", error);
        this.error = "Failed to clear local sync key";
      }
    }
  }

  private startEditsyncToPeer() {
    this.editingsyncToPeer = true;
    this.newsyncToPeer = this.syncToPeer;
  }

  private cancelEditsyncToPeer() {
    this.editingsyncToPeer = false;
    this.newsyncToPeer = this.syncToPeer;
  }

  private async updateSyncRemoteKey() {
    if (this.newsyncToPeer === this.syncToPeer) {
      this.editingsyncToPeer = false;
      return;
    }

    try {
      await updateWorkspaceSyncPeerId(this.workspaceKey, this.newsyncToPeer);
      this.syncToPeer = this.newsyncToPeer;
      this.editingsyncToPeer = false;
      this.error = null;
    } catch (error) {
      console.error("Failed to update sync key:", error);
      this.error = "Failed to update sync key";
    }
  }

  private disconnect() {
    if (!this.workspaceKey) return;

    try {
      disconnectWebRTC(this.workspaceKey);
      this.updateStatus();
    } catch (error) {
      console.error("Failed to disconnect WebRTC:", error);
      this.error = "Failed to disconnect";
    }
  }

  private async reconnect() {
    if (!this.workspaceKey) return;

    if (!this.localPeerId || this.localPeerId.trim() === "") {
      this.error = "Cannot reconnect: Local peer ID is empty";
      return;
    }

    try {
      await enableWebRTC(this.workspaceKey);
      setTimeout(() => this.updateStatus(), 500);
    } catch (error) {
      console.error("Failed to reconnect WebRTC:", error);
      this.error = "Failed to reconnect";
    }
  }

  private async handleCreateCategory() {
    const name = this.newCategoryName.trim();
    if (!name) {
      this.error = "Category name cannot be empty";
      return;
    }

    try {
      await createCategory(this.workspaceKey, name);
      this.newCategoryName = "";
      this.showCategoryForm = false;
      await this.loadCategories();
    } catch (error) {
      console.error("Failed to create category:", error);
      this.error = "Failed to create category";
    }
  }

  private async handleDeleteCategory(categoryId: string) {
    if (!confirm("Delete this category?")) return;

    try {
      await deleteCategory(this.workspaceKey, categoryId);
      await this.loadCategories();
      // Reset default category if it was deleted
      if (this.defaultCategory === categoryId) {
        this.defaultCategory = "all";
        await setDefaultCategory(this.workspaceKey, "all");
      }
    } catch (error) {
      console.error("Failed to delete category:", error);
      this.error = "Failed to delete category";
    }
  }

  private async handleDefaultCategoryChange(categoryId: string) {
    try {
      this.defaultCategory = categoryId;
      await setDefaultCategory(this.workspaceKey, categoryId);
    } catch (error) {
      console.error("Failed to set default category:", error);
      this.error = "Failed to set default category";
    }
  }

  private goBack() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: "workspace-browser" },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async handleExport() {
    if (!this.workspaceKey) {
      this.error = "Workspace key not available";
      return;
    }

    try {
      const state = await exportWorkspaceState(this.workspaceKey);
      downloadWorkspaceFile(this.workspaceKey, state);
      this.importSuccess = "Workspace exported successfully";
      setTimeout(() => {
        this.importSuccess = null;
      }, 3000);
    } catch (error) {
      console.error("Failed to export workspace:", error);
      this.error = `Export failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  private async handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!this.workspaceKey) {
      this.error = "Workspace key not available";
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        await importWorkspaceState(this.workspaceKey, uint8Array);
        this.importSuccess = "Workspace imported and merged successfully";
        setTimeout(() => {
          this.importSuccess = null;
        }, 3000);
        // Reset file input
        input.value = "";
      } catch (error) {
        console.error("Failed to import workspace:", error);
        this.error = `Import failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        input.value = "";
      }
    };

    reader.onerror = () => {
      this.error = "Failed to read file";
      input.value = "";
    };

    reader.readAsArrayBuffer(file);
  }

  render() {
    const statusText =
      this.status === "connected"
        ? "Connected"
        : this.status === "connecting"
        ? "Connecting"
        : "Disconnected";

    return html`
      <div class="header">
        <h2>Settings</h2>
        <button class="back-button" @click=${() => this.goBack()}>Back</button>
      </div>

      <div class="content">
        ${this.error ? html` <div class="warning">${this.error}</div> ` : ""}

        <div class="section">
          <h3>Workspace Information</h3>
          <div class="form-group">
            <label>Workspace Name</label>
            <input
              type="text"
              class="readonly"
              .value=${this.workspaceName}
              readonly
            />
          </div>
        </div>

        <div class="section">
          <h3>Sync Configuration</h3>

          <div class="form-group">
            <label>Local Peer ID QR Code</label>
            ${this.localPeerId
              ? html`
                  <div
                    style="display: flex; flex-direction: column; align-items: center; gap: 1rem;"
                  >
                    ${this.qrCodeDataUrl
                      ? html`
                          <img
                            src="${this.qrCodeDataUrl}"
                            alt="Local Peer ID QR Code"
                            style="border: 2px solid #ddd; padding: 0.5rem; border-radius: 4px;"
                          />
                        `
                      : html`<div>Generating QR code...</div>`}
                    <div
                      style="text-align: center; font-size: 0.85rem; color: #666;"
                    >
                      Scan this QR code from another device to sync
                    </div>
                  </div>
                `
              : html`<div style="color: #999;">No local peer ID set</div>`}
          </div>

          <div class="form-group">
            <label>Sync by Scanning Remote QR</label>
            ${this.isScanningForSync
              ? html`
                  <div
                    style="display: flex; flex-direction: column; gap: 1rem;"
                  >
                    <div
                      id="sync-scan-container"
                      style="position: relative; width: 100%; max-width: 400px; margin: 0 auto;"
                    >
                      <video
                        id="sync-camera-video"
                        autoplay
                        playsinline
                        style="width: 100%; height: auto; display: block; border: 2px solid #ddd; border-radius: 4px;"
                      ></video>
                      <canvas
                        id="sync-scan-canvas"
                        style="display: none;"
                      ></canvas>
                    </div>
                    <button
                      @click=${() => this.stopScanningForSync()}
                      class="danger"
                      style="width: 100%;"
                    >
                      Cancel Scan
                    </button>
                  </div>
                `
              : html`
                  <button
                    @click=${() => {
                      this.startScanForSync();
                      setTimeout(() => this.beginScanForSync(), 0);
                    }}
                    style="width: 100%; margin-top: 0.5rem;"
                  >
                    Scan Remote Peer QR Code
                  </button>
                  <div class="info">
                    Scan a QR code from the remote peer's settings to auto-fill
                    the sync ID
                  </div>
                `}
          </div>

          ${this.editingsyncToPeer
            ? html`
                <div class="stacked-form">
                  <label
                    >Sync to Peer
                    <input
                      type="text"
                      .value=${this.newsyncToPeer}
                      @input=${(e: Event) => {
                        this.newsyncToPeer = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      placeholder="Enter new sync key"
                  /></label>
                  <div class="info">
                    Changing the sync key will disconnect from current peers and
                    connect to a new room.
                  </div>
                  <div class="tool-bar">
                    <button @click=${() => this.updateSyncRemoteKey()}>
                      Save Key
                    </button>
                    <button
                      class="danger"
                      @click=${() => this.cancelEditsyncToPeer()}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              `
            : html`
                <div class="form-group">
                  <label
                    >Sync To Peer
                    <input
                      type="text"
                      class="readonly"
                      .value=${this.syncToPeer}
                      readonly
                  /></label>
                  <button
                    @click=${() => this.startEditsyncToPeer()}
                    style="margin-top: 0.5rem; width: 100%;"
                  >
                    Edit Sync Key
                  </button>
                </div>
              `}

          <div class="form-group">
            <label
              >Local Peer ID
              <input
                type="text"
                class="readonly"
                .value=${this.localPeerId}
                readonly
            /></label>

            <div class="tool-bar">
              <button
                @click=${() => this.startRegenLocalKey()}
                style="margin-top: 0.5rem; width: 100%;"
              >
                Regenerate Local Peer ID
              </button>
              <button
                @click=${() => this.startClearLocalKey()}
                style="margin-top: 0.5rem; width: 100%;"
              >
                Clear local ID/Disable Sync
              </button>
            </div>
          </div>
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
              <span
                class="status-value"
                style="font-family: monospace; font-size: 0.85rem;"
                >${this.signalingServer}</span
              >
            </div>
          </div>

          <div class="button-group">
            ${this.connected
              ? html`
                  <button class="danger" @click=${() => this.disconnect()}>
                    Disconnect
                  </button>
                `
              : html`
                  <button @click=${() => this.reconnect()}>Reconnect</button>
                `}
          </div>
        </div>

        <div class="section">
          <h3>Categories</h3>
          ${this.categories.length > 0
            ? html`
                <div style="margin-bottom: 1rem;">
                  <div style="margin-bottom: 1rem;">
                    <label>Default Category for Workspace Browser</label>
                    <select
                      .value=${this.defaultCategory}
                      @change=${(e: Event) =>
                        this.handleDefaultCategoryChange(
                          (e.target as HTMLSelectElement).value
                        )}
                      style="width: 100%; padding: 0.5rem; border-radius: 4px; border: 1px solid #ddd;"
                    >
                      <option value="all">All Items</option>
                      ${this.categories.map(
                        (cat) => html`
                          <option value="${cat.id}">${cat.name}</option>
                        `
                      )}
                    </select>
                  </div>

                  ${this.categories.map(
                    (cat) => html`
                      <div
                        style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #f5f5f5; border-radius: 4px; margin-bottom: 0.5rem;"
                      >
                        <span>${cat.name}</span>
                        <button
                          class="danger"
                          @click=${() => this.handleDeleteCategory(cat.id)}
                          style="padding: 4px 8px; font-size: 0.9rem;"
                        >
                          Delete
                        </button>
                      </div>
                    `
                  )}
                </div>
              `
            : html`
                <div
                  style="padding: 0.75rem; background: #f9f9f9; border-radius: 4px; margin-bottom: 1rem; color: #666;"
                >
                  No categories yet
                </div>
              `}
          ${this.showCategoryForm
            ? html`
                <div class="stacked-form">
                  <label
                    >Category Name
                    <input
                      type="text"
                      .value=${this.newCategoryName}
                      @input=${(e: Event) => {
                        this.newCategoryName = (
                          e.target as HTMLInputElement
                        ).value;
                      }}
                      placeholder="Enter category name"
                    />
                  </label>
                  <div class="tool-bar">
                    <button @click=${() => this.handleCreateCategory()}>
                      Create
                    </button>
                    <button
                      class="danger"
                      @click=${() => (this.showCategoryForm = false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              `
            : html`
                <button
                  @click=${() => (this.showCategoryForm = true)}
                  style="width: 100%;"
                >
                  Add Category
                </button>
              `}
        </div>

        <div class="section">
          <h3>Backup & Restore</h3>
          ${this.importSuccess
            ? html`
                <div
                  style="padding: 0.75rem; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 4px; font-size: 0.9rem; margin-bottom: 1rem;"
                >
                  ${this.importSuccess}
                </div>
              `
            : ""}

          <div class="form-group">
            <label>Export Workspace</label>
            <button @click=${() => this.handleExport()} style="width: 100%;">
              Download .invupd File
            </button>
            <div class="info">Export entire workspace state to file</div>
          </div>

          <div class="form-group">
            <label>Import Workspace</label>
            <input
              type="file"
              accept=".invupd"
              @change=${(e: Event) => this.handleImportFile(e)}
            />
            <div class="warning">Importing will merge with existing data</div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-settings": WorkspaceSettings;
  }
}
