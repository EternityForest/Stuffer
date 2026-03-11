import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItem,
  getWorkspaceDoc,
  resolveItemId,
} from "../services/storage.js";
import jsQR from "jsqr";
import "./nfc-toggle-button.js";

@customElement("qr-scanner")
export class QrScanner extends LitElement {
  override createRenderRoot() {
    return this;
  }

  static styles = css`
    .scanner-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .toolbar {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    #scan-container {
      position: relative;
      width: 100%;
      max-width: 500px;
      margin: 1rem auto;
    }

    video {
      width: 100%;
      height: auto;
      display: block;
    }

    canvas {
      display: none;
    }

    .scan-result {
      border: 2px solid #4caf50;
      padding: 1rem;
      border-radius: 8px;
      background: #f1f8f5;
      margin: 1rem 0;
    }

    .scan-result h3 {
      margin: 0 0 0.5rem 0;
      color: #1976d2;
    }

    .scan-result p {
      margin: 0.25rem 0;
      color: #666;
    }

    .scan-result button {
      margin-top: 0.5rem;
    }

    .no-result {
      text-align: center;
      padding: 2rem;
      color: #999;
    }

    .toast {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 1rem;
      border-radius: 4px;
      color: white;
      z-index: 1000;
    }

    .toast.success {
      background: #4caf50;
    }

    .toast.error {
      background: #f44336;
    }
  `;

  @property()
  declare workspaceKey: string;

  @state()
  declare isScanning: boolean;

  @state()
  declare scannedItems: Array<{
    id: string;
    title: string;
    description: string;
  }>;

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: "success" | "error";

  constructor() {
    super();
    this.isScanning = false;
    this.scannedItems = [];
    this.toastMessage = "";
    this.toastType = "success";
  }

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private scanningAnimation: number | null = null;
  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;
  private boundGlobalTagScan: EventListener | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.boundGlobalTagScan = this.globalTagScan.bind(this) as EventListener;
    globalThis.addEventListener("globalTagScan", this.boundGlobalTagScan);
    this.setupYjsListener();
    this.startScanning();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Ensure scanning is fully stopped
    this.stopScanning();

    // Remove event listeners
    if (this.boundGlobalTagScan) {
      globalThis.removeEventListener("globalTagScan", this.boundGlobalTagScan);
    }

    // Cleanup Yjs listener
    this.cleanupYjsListener();
  }

  private globalTagScan(event: Event) {
    const customEvent = event as CustomEvent<{ qrData: string }>;
    this.handleQRScan(customEvent.detail.qrData);
  }

  private async setupYjsListener() {
    try {
      const yDoc = await getWorkspaceDoc(this.workspaceKey);
      this.updateListener = () => {
        this.requestUpdate();
      };
      yDoc.on("update", this.updateListener);
    } catch (error) {
      console.error("Failed to subscribe to Yjs updates:", error);
    }
  }

  private async cleanupYjsListener() {
    if (this.updateListener) {
      try {
        const yDoc = await getWorkspaceDoc(this.workspaceKey);
        yDoc.off("update", this.updateListener!);
        this.updateListener = null;
      } catch (error) {
        console.error("Failed to unsubscribe from Yjs updates:", error);
      }
    }
  }

  private toggleScanning() {
    if (this.isScanning) {
      this.stopScanning();
    } else {
      this.startScanning();
    }
  }

  private async startScanning() {
    try {
      this.isScanning = true;
      await this.updateComplete;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.videoElement = this.querySelector("#camera-video") as HTMLVideoElement;
      this.canvasElement = this.querySelector("#scan-canvas") as HTMLCanvasElement;

      if (this.videoElement) {
        this.videoElement.srcObject = stream;

        // Wait for video to be ready before scanning
        const playPromise = this.videoElement.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            this.startQRScanning();
          }).catch((error) => {
            console.error("Error playing video:", error);
          });
        } else {
          this.startQRScanning();
        }
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      this.showToast("Could not access camera", "error");
      this.isScanning = false;
    }
  }

  private stopScanning() {
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }

    if (this.scanningAnimation) {
      cancelAnimationFrame(this.scanningAnimation);
      this.scanningAnimation = null;
    }

    this.isScanning = false;
  }

  private startQRScanning() {
    if (!this.isScanning || !this.videoElement || !this.canvasElement) return;

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
      this.handleQRScan(code.data);
    } else {
      this.scanningAnimation = requestAnimationFrame(() =>
        this.startQRScanning()
      );
    }
  }

  private async handleQRScan(qrData: string) {
    try {
      const resolvedId = await resolveItemId(this.workspaceKey, qrData);
      const item = await getItem(this.workspaceKey, resolvedId);

      // Check if item is already scanned
      const alreadyScanned = this.scannedItems.some((i) => i.id === item.id);
      if (!alreadyScanned) {
        this.scannedItems = [
          {
            id: item.id,
            title: item.title,
            description: item.description,
          },
          ...this.scannedItems,
        ];
        this.showToast(`✓ Scanned: ${item.title}`, "success");
      }

      // Continue scanning if camera is active
      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
    } catch (error) {
      console.error("Error handling QR scan:", error);
      this.showToast("Could not find item", "error");

      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
    }
  }

  private showToast(message: string, type: "success" | "error") {
    this.toastMessage = message;
    this.toastType = type;

    setTimeout(() => {
      this.toastMessage = "";
    }, 2000);
  }

  private navigateToObject(objectId: string) {
    this.dispatchEvent(
      new CustomEvent("select-object", {
        detail: objectId,
        bubbles: true,
        composed: true,
      })
    );
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

  render() {
    return html`
      ${this.toastMessage
        ? html`
            <div class="toast ${this.toastType}">${this.toastMessage}</div>
          `
        : ""}

      <div class="scanner-container">
        <div class="tool-bar">
          <button @click=${() => this.toggleScanning()}>
            ${this.isScanning ? "Stop Camera" : "Start Camera"}
          </button>
          <nfc-toggle-button></nfc-toggle-button>
          <button @click=${() => this.goBack()}>Back</button>
        </div>

                ${this.scannedItems.length > 0
          ? html`
              <div>
                <h2>Scanned Items</h2>
                ${this.scannedItems.map(
                  (item) => html`
                    <div class="scan-result">
                      <h3>${item.title}</h3>
                      <p>${item.description || "No description"}</p>
                      <button @click=${() => this.navigateToObject(item.id)}>
                        View Details
                      </button>
                    </div>
                  `
                )}
              </div>
            `
          : html`
              <div class="no-result">
                ${this.isScanning
                  ? "No items scanned yet. Scan a QR code or NFC tag."
                  : "Start scanning to view results."}
              </div>
            `}

        ${this.isScanning
          ? html`
              <div id="scan-container">
                <video id="camera-video" autoplay playsinline></video>
                <canvas id="scan-canvas" style="display: none"></canvas>
              </div>
            `
          : ""}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "qr-scanner": QrScanner;
  }
}
