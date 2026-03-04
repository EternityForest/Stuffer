import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { addItem } from '../services/storage.js';
import jsQR from 'jsqr';

@customElement('add-remove-item')
export class AddRemoveItem extends LitElement {
  static createRenderRoot() {
    return this;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .header {
      padding: 1rem;
      border-bottom: 1px solid #ddd;
      display: flex;
      gap: 1rem;
    }

    button {
      padding: 0.5rem 1rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    button:hover {
      background-color: #0056b3;
    }

    .content {
      flex: 1;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      overflow-y: auto;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .input-group label {
      font-weight: bold;
    }

    .input-group input,
    .input-group textarea {
      padding: 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: inherit;
      font-size: 1rem;
    }

    .input-group textarea {
      resize: vertical;
      min-height: 80px;
    }

    .scan-container {
      position: relative;
      border: 2px solid #007bff;
      border-radius: 4px;
      overflow: hidden;
      background-color: #000;
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #qr-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .scan-preview {
      border: 2px dashed #007bff;
      padding: 2rem;
      text-align: center;
      border-radius: 4px;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f8f9fa;
    }

    .scan-result {
      padding: 1rem;
      background-color: #cce5ff;
      color: #004085;
      border: 1px solid #b8daff;
      border-radius: 4px;
      font-family: monospace;
      word-break: break-all;
    }

    .action-buttons {
      display: flex;
      gap: 1rem;
    }

    .action-buttons button {
      flex: 1;
    }

    .secondary-btn {
      background-color: #6c757d;
    }

    .secondary-btn:hover {
      background-color: #5a6268;
    }

    .success-message {
      padding: 1rem;
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      border-radius: 4px;
      margin-bottom: 1rem;
      display: none;
    }

    .success-message.show {
      display: block;
    }

    .scanning-indicator {
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: #28a745;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
  `;

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

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;

  constructor() {
    super();
    this.itemName = '';
    this.qrData = '';
    this.successMessage = '';
    this.workspaceKey = '';
    this.isScanning = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScanning();
  }

  render() {
    return html`
      <div class="header">
        <button class="secondary-btn" @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="content">
        <div class="success-message ${this.successMessage ? 'show' : ''}">
          ${this.successMessage}
        </div>

        <div class="input-group">
          <label>Item Name</label>
          <input
            type="text"
            placeholder="Enter item name (will generate UUID)"
            .value=${this.itemName}
            @input=${(e: Event) => { this.itemName = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.addManualItem(); }}
          />
        </div>

        <div class="action-buttons">
          <button @click=${() => this.addManualItem()}>Add Item</button>
          <button @click=${() => this.toggleScanning()}>${this.isScanning ? 'Stop Scanning' : 'Scan QR Code'}</button>
        </div>

        ${this.isScanning ? html`
          <div class="input-group">
            <label>QR Scanner</label>
            <div class="scan-container">
              <video id="qr-video"></video>
              <div class="scanning-indicator">Scanning...</div>
            </div>
          </div>
        ` : ''}

        ${this.qrData ? html`
          <div class="input-group">
            <label>Scanned QR Data</label>
            <div class="scan-result">${this.qrData}</div>
          </div>
          <div class="action-buttons">
            <button @click=${() => this.addScannedItem()}>Add Scanned Item</button>
            <button class="secondary-btn" @click=${() => this.clearScan()}>Clear Scan</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private goBack() {
    this.stopScanning();
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'workspace-browser' },
      bubbles: true,
      composed: true,
    }));
  }

  private addManualItem() {
    if (!this.itemName.trim()) {
      alert('Please enter an item name');
      return;
    }

    if (!this.workspaceKey) {
      alert('No workspace selected');
      return;
    }

    try {
      addItem(this.workspaceKey, this.itemName);
      this.showSuccess(`Item "${this.itemName}" added successfully`);
      this.itemName = '';
    } catch (error) {
      alert(`Failed to add item: ${error}`);
    }
  }

  private addScannedItem() {
    if (!this.itemName.trim()) {
      alert('Please enter an item name');
      return;
    }

    if (!this.workspaceKey) {
      alert('No workspace selected');
      return;
    }

    try {
      addItem(this.workspaceKey, this.itemName, this.qrData);
      this.showSuccess(`Item "${this.itemName}" with QR data added successfully`);
      this.itemName = '';
      this.qrData = '';
      this.stopScanning();
    } catch (error) {
      alert(`Failed to add item: ${error}`);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      this.isScanning = true;
      this.requestUpdate();

      setTimeout(() => {
        this.videoElement = this.shadowRoot?.querySelector('#qr-video') as HTMLVideoElement;
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
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    if (this.scanningInterval !== null) {
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
    }
  }

  private startQRScanning() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scanFrame = () => {
      if (!this.isScanning || !this.videoElement || !ctx) return;

      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          this.qrData = code.data;
          this.stopScanning();
          this.showSuccess('QR code scanned successfully!');
          return;
        }
      }

      this.scanningInterval = window.requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }

  private clearScan() {
    this.qrData = '';
  }

  private showSuccess(message: string) {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'add-remove-item': AddRemoveItem;
  }
}
