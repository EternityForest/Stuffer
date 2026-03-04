import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { addItem, findItemByQR, deleteItem } from '../services/storage.js';
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

    .mode-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .mode-btn {
      flex: 1;
      padding: 0.75rem;
      border: 2px solid #ccc;
      background-color: white;
      color: #333;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }

    .mode-btn.active {
      border-color: #007bff;
      background-color: #007bff;
      color: white;
    }

    .mode-btn.remove.active {
      background-color: #dc3545;
      border-color: #dc3545;
    }

    .toast {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 1rem 1.5rem;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      animation: slideIn 0.3s ease-out;
      z-index: 1000;
      max-width: 300px;
    }

    .toast.success {
      background-color: #28a745;
    }

    .toast.error {
      background-color: #dc3545;
    }

    .toast.info {
      background-color: #17a2b8;
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
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

  @state()
  declare mode: 'add' | 'remove';

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: 'success' | 'info' | 'error';

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;
  private audioContext: AudioContext | null = null;

  constructor() {
    super();
    this.itemName = '';
    this.qrData = '';
    this.successMessage = '';
    this.workspaceKey = '';
    this.isScanning = false;
    this.mode = 'add';
    this.toastMessage = '';
    this.toastType = 'success';
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
        ${this.toastMessage ? html`
          <div class="toast ${this.toastType}">
            ${this.toastMessage}
          </div>
        ` : ''}

        <div class="mode-toggle">
          <button class="mode-btn ${this.mode === 'add' ? 'active' : ''}" @click=${() => this.setMode('add')}>
            Add Items
          </button>
          <button class="mode-btn remove ${this.mode === 'remove' ? 'active' : ''}" @click=${() => this.setMode('remove')}>
            Remove Items
          </button>
        </div>

        ${this.mode === 'add' ? html`
          <div class="input-group">
            <label>Item Name (Manual Entry)</label>
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
        ` : html`
          <div class="input-group">
            <label>Quick Remove Mode</label>
            <p style="color: #666; font-size: 0.9rem; margin: 0;">Scan QR codes to quickly remove items from this workspace</p>
          </div>

          <div class="action-buttons">
            <button @click=${() => this.toggleScanning()}>${this.isScanning ? 'Stop Scanning' : 'Start Scanning'}</button>
          </div>
        `}

        ${this.isScanning ? html`
          <div class="input-group">
            <label>QR Scanner</label>
            <div class="scan-container">
              <video id="qr-video"></video>
              <div class="scanning-indicator">Scanning...</div>
            </div>
          </div>
        ` : ''}

        ${this.mode === 'add' && this.qrData && !this.isScanning ? html`
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

  private setMode(mode: 'add' | 'remove') {
    this.mode = mode;
    this.qrData = '';
    this.itemName = '';
  }

  private addManualItem() {
    if (!this.itemName.trim()) {
      this.showToast('Please enter an item name', 'error');
      return;
    }

    if (!this.workspaceKey) {
      this.showToast('No workspace selected', 'error');
      return;
    }

    try {
      addItem(this.workspaceKey, this.itemName);
      this.showToast(`✓ "${this.itemName}" added`, 'success');
      this.itemName = '';
    } catch (error) {
      this.showToast(`Failed to add item: ${error}`, 'error');
    }
  }

  private addScannedItem() {
    if (!this.itemName.trim()) {
      this.showToast('Please enter an item name', 'error');
      return;
    }

    if (!this.workspaceKey) {
      this.showToast('No workspace selected', 'error');
      return;
    }

    try {
      addItem(this.workspaceKey, this.itemName, this.qrData);
      this.showToast(`✓ "${this.itemName}" added with QR`, 'success');
      this.itemName = '';
      this.qrData = '';
      // Keep scanning active for fast entry
      this.startScanning();
    } catch (error) {
      this.showToast(`Failed to add item: ${error}`, 'error');
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
    if (this.mode === 'add') {
      this.handleAddMode(qrData);
    } else {
      this.handleRemoveMode(qrData);
    }
  }

  private handleAddMode(qrData: string) {
    try {
      const existingItem = findItemByQR(this.workspaceKey, qrData);

      if (existingItem) {
        // Item already exists, just show toast
        this.showToast(`✓ ${existingItem.name} (already exists)`, 'info');
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
      this.showToast(`Error scanning: ${error}`, 'error');
    }
  }

  private handleRemoveMode(qrData: string) {
    try {
      const itemToRemove = findItemByQR(this.workspaceKey, qrData);

      if (itemToRemove) {
        deleteItem(this.workspaceKey, itemToRemove.id);
        this.showToast(`✓ "${itemToRemove.name}" removed`, 'success');
        // Keep scanning for rapid removal
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
      } else {
        this.showToast('QR code not found in inventory', 'error');
        // Keep scanning
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
      }
    } catch (error) {
      this.showToast(`Error removing item: ${error}`, 'error');
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
    this.qrData = '';
  }

  private showSuccess(message: string) {
    this.successMessage = message;
    setTimeout(() => {
      this.successMessage = '';
    }, 3000);
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toastMessage = message;
    this.toastType = type;
    this.playFeedback();
    setTimeout(() => {
      this.toastMessage = '';
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
      const audio = new Audio('/assets/185828__lloydevans09__little-thing.opus');
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
    'add-remove-item': AddRemoveItem;
  }
}
