import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getAliasesForItem,
  addAlias,
  deleteAlias,
  getItem,
} from "../services/storage.js";
import type { TagAlias } from "../services/storage.js";
import jsQR from "jsqr";

@customElement("alias-editor")
export class AliasEditor extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property()
  declare itemId: string;

  @property()
  declare workspaceKey: string;

  @state()
  declare aliases: Array<TagAlias>;

  @state()
  declare isLoading: boolean;

  @state()
  declare itemTitle: string;

  @state()
  declare manualTagInput: string;

  @state()
  declare isScanning: boolean;

  @state()
  declare scanToastMessage: string;

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;

  constructor() {
    super();
    this.itemId = "";
    this.workspaceKey = "";
    this.aliases = [];
    this.isLoading = true;
    this.itemTitle = "";
    this.manualTagInput = "";
    this.isScanning = false;
    this.scanToastMessage = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadAliases();
    this.loadItemTitle();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScanning();
  }

  private async loadItemTitle() {
    try {
      const item = await getItem(this.workspaceKey, this.itemId);
      this.itemTitle = item.title;
    } catch (error) {
      console.error("Failed to load item title:", error);
      this.itemTitle = "Unknown";
    }
  }

  private async loadAliases() {
    try {
      this.isLoading = true;
      this.aliases = await getAliasesForItem(this.workspaceKey, this.itemId);
    } catch (error) {
      console.error("Failed to load aliases:", error);
      this.aliases = [];
    } finally {
      this.isLoading = false;
    }
  }

  private handleManualTagInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.manualTagInput = input.value;
  }

  private async addManualAlias() {
    const aliasId = this.manualTagInput.trim();
    if (!aliasId) {
      alert("Please enter a tag ID");
      return;
    }

    if (this.aliases.some((a) => a.id === aliasId)) {
      alert("This tag is already an alias for this item");
      return;
    }

    try {
      await addAlias(this.workspaceKey, aliasId, this.itemId);
      this.manualTagInput = "";
      await this.loadAliases();
    } catch (error) {
      console.error("Failed to add alias:", error);
      alert("Failed to add alias");
    }
  }

  private async addQRScannedAlias(aliasId: string) {
    if (this.aliases.some((a) => a.id === aliasId)) {
      alert("This tag is already an alias for this item");
      return;
    }

    try {
      await addAlias(this.workspaceKey, aliasId, this.itemId);
      await this.loadAliases();
    } catch (error) {
      console.error("Failed to add alias:", error);
      alert("Failed to add alias");
    }
  }

  private async startQRScanning() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.isScanning = true;
      this.requestUpdate();

      setTimeout(() => {
        this.videoElement = this.querySelector("#qr-scan-video") as HTMLVideoElement;
        if (this.videoElement) {
          this.videoElement.srcObject = stream;
          this.videoElement.play();
          this.processQRFrames();
        }
      }, 0);
    } catch (error) {
      this.scanToastMessage = `Camera access denied: ${error}`;
      this.isScanning = false;
    }
  }

  private stopScanning() {
    this.isScanning = false;
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }
    if (this.scanningInterval !== null) {
      cancelAnimationFrame(this.scanningInterval);
      this.scanningInterval = null;
    }
  }

  private processQRFrames() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const scanFrame = () => {
      if (!this.isScanning || !this.videoElement || !ctx) return;

      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          this.handleQRCodeDetected(code.data);
          return;
        }
      }

      this.scanningInterval = window.requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }

  private async handleQRCodeDetected(qrData: string) {
    try {
      await this.addQRScannedAlias(qrData);
      this.stopScanning();
    } catch (error) {
      console.error("Failed to handle QR scan:", error);
      this.scanToastMessage = "Failed to process QR code";
      if (this.isScanning && this.videoElement) {
        this.processQRFrames();
      }
    }
  }

  private handleQRScan() {
    this.startQRScanning();
  }

  private async removeAlias(aliasId: string) {
    if (!confirm(`Remove alias "${aliasId}"?`)) return;

    try {
      await deleteAlias(this.workspaceKey, aliasId);
      await this.loadAliases();
    } catch (error) {
      console.error("Failed to delete alias:", error);
      alert("Failed to remove alias");
    }
  }

  private goBack() {
    this.dispatchEvent(
      new CustomEvent("close-alias-editor", {
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <div class="alias-editor-modal">
        <div class="alias-editor-content">
          <div class="editor-header">
            <h2>Tag Aliases for: ${this.itemTitle}</h2>
            <button @click=${() => this.goBack()} class="close-btn">×</button>
          </div>

          ${
            this.isLoading
              ? html`<div class="loading">Loading aliases...</div>`
              : html`
                  <div class="aliases-section">
                    <h3>Current Aliases</h3>
                    ${
                      this.aliases.length > 0
                        ? html`
                            <div class="aliases-list">
                              ${this.aliases.map(
                                (alias) => html`
                                  <div class="alias-item">
                                    <div class="alias-info">
                                      <code>${alias.id}</code>
                                      <small>
                                        Created
                                        ${new Date(
                                          alias.createdAt
                                        ).toLocaleString()}
                                      </small>
                                    </div>
                                    <button
                                      @click=${() =>
                                        this.removeAlias(alias.id)}
                                      class="danger-btn"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                `
                              )}
                            </div>
                          `
                        : html`
                            <div class="no-aliases">
                              No aliases yet. Add one below.
                            </div>
                          `
                    }
                  </div>

                  <div class="add-alias-section">
                    <h3>Add New Alias</h3>

                    <div class="input-group">
                      <label>Manual Tag ID</label>
                      <div class="input-row">
                        <input
                          type="text"
                          placeholder="Enter tag ID"
                          .value=${this.manualTagInput}
                          @input=${this.handleManualTagInput}
                        />
                        <button
                          @click=${() => this.addManualAlias()}
                          class="primary-btn"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    ${
                      !this.isScanning
                        ? html`
                            <div class="button-group">
                              <button @click=${() => this.handleQRScan()}>
                                Scan QR Code
                              </button>
                            </div>
                          `
                        : html`
                            <div class="scanning-container">
                              <video
                                id="qr-scan-video"
                                class="qr-video"
                                playsinline
                              ></video>
                              ${
                                this.scanToastMessage
                                  ? html`
                                      <div class="scan-toast">
                                        ${this.scanToastMessage}
                                      </div>
                                    `
                                  : ""
                              }
                              <button
                                @click=${() => this.stopScanning()}
                                class="danger-btn"
                              >
                                Stop Scanning
                              </button>
                            </div>
                          `
                    }
                  </div>
                `
          }

          <div class="editor-footer">
            <button @click=${() => this.goBack()} class="secondary-btn">
              Done
            </button>
          </div>
        </div>
      </div>

      <style>
        .alias-editor-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .alias-editor-content {
          background: white;
          border-radius: 8px;
          padding: 20px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }

        .editor-header h2 {
          margin: 0;
          font-size: 1.2em;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: #000;
        }

        .aliases-section {
          margin-bottom: 30px;
        }

        .aliases-section h3,
        .add-alias-section h3 {
          font-size: 1em;
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
        }

        .aliases-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .alias-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
          gap: 10px;
        }

        .alias-info {
          flex: 1;
          min-width: 0;
        }

        .alias-info code {
          display: block;
          word-break: break-all;
          font-weight: bold;
          margin-bottom: 4px;
        }

        .alias-info small {
          color: #666;
          font-size: 0.85em;
        }

        .no-aliases {
          padding: 15px;
          background: #f9f9f9;
          border-radius: 4px;
          color: #666;
          text-align: center;
        }

        .add-alias-section {
          margin-bottom: 20px;
        }

        .input-group {
          margin-bottom: 15px;
        }

        .input-group label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          color: #333;
        }

        .input-row {
          display: flex;
          gap: 10px;
        }

        .input-row input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .input-row input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
        }

        .button-group button {
          flex: 1;
        }

        button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .primary-btn {
          background: #007bff;
          color: white;
        }

        .primary-btn:hover {
          background: #0056b3;
        }

        .secondary-btn {
          background: #6c757d;
          color: white;
        }

        .secondary-btn:hover {
          background: #5a6268;
        }

        .danger-btn {
          background: #dc3545;
          color: white;
          padding: 6px 12px;
          font-size: 13px;
          white-space: nowrap;
        }

        .danger-btn:hover {
          background: #c82333;
        }

        .editor-footer {
          display: flex;
          gap: 10px;
          border-top: 1px solid #eee;
          padding-top: 15px;
          margin-top: 20px;
        }

        .editor-footer button {
          flex: 1;
        }

        .loading {
          text-align: center;
          color: #666;
          padding: 20px;
        }

        .scanning-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 15px;
        }

        .qr-video {
          width: 100%;
          height: 300px;
          background: #000;
          border-radius: 4px;
        }

        .scan-toast {
          padding: 10px;
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          font-size: 13px;
          text-align: center;
        }
      </style>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "alias-editor": AliasEditor;
  }
}
