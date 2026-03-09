import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  addItem,
  getItem,
  deleteItem,
  updateLastScanned,
} from "../services/storage.js";
import jsQR from "jsqr";

@customElement("add-remove-item")
export class AddRemoveItem extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property()
  declare workspaceKey: string;

  @state()
  declare itemName: string;

  @state()
  declare qrData: string;

  @state()
  declare successMessage: string;

  @state()
  declare isScanning: boolean;

  @state()
  declare mode: "add" | "remove";

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: "success" | "info" | "error";

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;
  private audioContext: AudioContext | null = null;

  private boundGlobalTagScan: (event: Event) => void = () => {};

  constructor() {
    super();
    this.itemName = "";
    this.qrData = "";
    this.successMessage = "";
    this.workspaceKey = "";
    this.isScanning = false;
    this.mode = "add";
    this.toastMessage = "";
    this.toastType = "success";
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScanning();
    globalThis.removeEventListener("globalTagScan", this.boundGlobalTagScan);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.boundGlobalTagScan = this.globalTagScan.bind(this) as typeof this.boundGlobalTagScan
    globalThis.addEventListener("globalTagScan", this.boundGlobalTagScan );
  }

  globalTagScan(event: CustomEvent<{ qrData: string }>) {
    this.handleQRScan(event.detail.qrData);
  }
  
  render() {
    return html`
      <div class="header">
        <h2>Add/Remove Items</h2>
      </div>
      <div class="content">
        ${this.toastMessage
          ? html`
              <div class="toast ${this.toastType}">${this.toastMessage}</div>
            `
          : ""}

        <div class="tool-bar">
          <button
            class="mode-btn ${this.mode === "add" ? "highlight" : ""}"
            @click=${() => this.setMode("add")}
          >
            Add Items
          </button>
          <button
            class="mode-btn remove ${this.mode === "remove" ? "highlight" : ""}"
            @click=${() => this.setMode("remove")}
          >
            Remove Items
          </button>

          <button class="secondary-btn" @click=${() => this.goBack()}>
            Back
          </button>
        </div>

        ${this.mode === "add"
          ? html`
              <div class="stacked-form">
                <label
                  >Item Name (Manual Entry)
                  <input
                    type="text"
                    placeholder="Enter item name (will generate UUID)"
                    .value=${this.itemName}
                    @input=${(e: Event) => {
                      this.itemName = (e.target as HTMLInputElement).value;
                    }}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") this.addScannedItem();
                    }}
                  />
                </label>
                <label
                  >Item ID

                  <input
                    type="text"
                    placeholder="Auto generate UUID"
                    .value=${this.qrData}
                    @input=${(e: Event) => {
                      this.qrData = (e.target as HTMLInputElement).value;
                    }}
                /></label>

                <div class="tool-bar">
                  <button @click=${() => this.addScannedItem()}>
                    Add Item
                  </button>
                  <button @click=${() => this.toggleScanning()}>
                    ${this.isScanning ? "Stop Scanning" : "Scan QR Code"}
                  </button>
                </div>
              </div>
            `
          : html`
              <div class="stacked-form">
                <label
                  >Quick Remove Mode
                  <p style="color: #666; font-size: 0.9rem; margin: 0;">
                    Scan QR codes to quickly remove items from this workspace
                  </p></label
                >

                <div class="tool-bar">
                  <button @click=${() => this.toggleScanning()}>
                    ${this.isScanning ? "Stop Scanning" : "Start Scanning"}
                  </button>
                </div>
              </div>
            `}
        ${this.isScanning
          ? html`
              <div class="stacked-form">
                <label
                  >QR Scanner
                  <div class="scan-container">
                    <video id="qr-video"></video>
                    <div class="scanning-indicator">Scanning...</div>
                  </div>
                </label>
              </div>
            `
          : ""}
        ${this.mode === "add" && this.qrData && !this.isScanning
          ? html`
              <div class="tool-bar">
                <button class="secondary-btn" @click=${() => this.clearScan()}>
                  Clear Scan
                </button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private goBack() {
    this.stopScanning();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: "workspace-browser" },
        bubbles: true,
        composed: true,
      })
    );
  }

  private setMode(mode: "add" | "remove") {
    this.mode = mode;
    this.qrData = "";
    this.itemName = "";
  }

  private addScannedItem() {
    if (!this.itemName.trim()) {
      this.showToast("Please enter an item name", "error");
      return;
    }

    if (!this.workspaceKey) {
      this.showToast("No workspace selected", "error");
      return;
    }

    try {
      if (this.qrData.trim().length > 0) {
        addItem(this.workspaceKey, this.itemName, this.qrData);
      } else {
        addItem(this.workspaceKey, this.itemName);
      }
      this.showToast(`✓ "${this.itemName}" added`, "success");
      this.itemName = "";

      const wasScanning = this.isScanning;
      this.qrData = "";

      if (wasScanning) {
        // Keep scanning active for fast entry
        this.startScanning();
      }
    } catch (error) {
      this.showToast(`Failed to add item: ${error}`, "error");
    }
  }

  private toggleScanning() {
    if (this.isScanning) {
      this.stopScanning();
    } else {
      this.startScanning();
    }
  }

  private handleQRScan(qrData: string) {
    // Basic usage to get location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateLastScanned(
            this.workspaceKey,
            qrData,
            position.coords.latitude,
            position.coords.longitude
          );
        },
        (error) => console.error(error)
      );
    } else {
      updateLastScanned(this.workspaceKey, qrData, 0, 0);
    }

    if (this.mode === "add") {
      this.handleAddMode(qrData);
    } else {
      this.handleRemoveMode(qrData);
    }
  }

  private async handleAddMode(qrData: string) {
    try {
      const existingItem = await getItem(this.workspaceKey, qrData);

      if (existingItem) {
        // Item already exists, just show toast
        this.showToast(`✓ ${existingItem.name} (already exists)`, "info");
        // Keep scanning
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
      } else {
        // New item, stop scanning and prompt for name
        this.stopScanning();
        this.qrData = qrData;
      }
    } catch (error) {
      this.showToast(`Error scanning: ${error}`, "error");
    }
  }

  private async handleRemoveMode(qrData: string) {
    try {
      const itemToRemove = await getItem(this.workspaceKey, qrData);

      if (itemToRemove) {
        await deleteItem(this.workspaceKey, itemToRemove.id);
        this.showToast(`✓ "${itemToRemove.name}" removed`, "success");
        // Keep scanning for rapid removal
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
      } else {
        this.showToast("QR code not found in inventory", "error");
        // Keep scanning
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
      }
    } catch (error) {
      this.showToast(`Error removing item: ${error}`, "error");
    }
  }

  private async startScanning() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.isScanning = true;
      this.requestUpdate();

      setTimeout(() => {
        this.videoElement = this.querySelector(
          "#qr-video"
        ) as HTMLVideoElement;
        if (this.videoElement) {
          this.videoElement.srcObject = stream;
          this.videoElement.play();
          this.startQRScanning();
        }
      }, 0);
    } catch (error) {
      alert(`Camera access denied or not available: ${error}`);
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
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
    }
  }

  private startQRScanning() {
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
          // Use smart mode handling instead of stopping scan
          this.handleQRScan(code.data);
          return;
        }
      }

      this.scanningInterval = window.requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }

  private clearScan() {
    this.qrData = "";
  }

  private showSuccess(message: string) {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = "";
    }, 3000);
  }

  private showToast(
    message: string,
    type: "success" | "error" | "info" = "success"
  ) {
    this.toastMessage = message;
    this.toastType = type;
    this.playFeedback();
    setTimeout(() => {
      this.toastMessage = "";
    }, 2500);
  }

  private playFeedback() {
    // Play scan sound
    this.playSound();
    // Vibrate if available
    this.vibrate();
  }

  private playSound() {
    try {
      const audio = new Audio(
        "/assets/185828__lloydevans09__little-thing.opus"
      );
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Silently fail if audio can't play
      });
    } catch (error) {
      // Silently fail if audio API unavailable
    }
  }

  private vibrate() {
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "add-remove-item": AddRemoveItem;
  }
}
