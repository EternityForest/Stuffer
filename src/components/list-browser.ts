import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getItems, getItemContents, addItemToContents, removeItemFromContents, findItemByQR, createLoadout, getLoadout, addItemToLoadout, removeItemFromLoadout } from '../services/storage.js';
import jsQR from 'jsqr';

@customElement('list-browser')
export class ListBrowser extends LitElement {
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
      align-items: center;
    }

    h2 {
      margin: 0;
      flex: 1;
      font-size: 1.1rem;
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

    .list-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 0.5rem;
      background-color: white;
    }

    .item-info {
      flex: 1;
    }

    .item-name {
      font-weight: 500;
      margin-bottom: 0.25rem;
    }

    .item-meta {
      font-size: 0.85rem;
      color: #666;
    }

    .item-actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.9rem;
      width: auto;
    }

    .add-btn {
      background-color: #28a745;
    }

    .add-btn:hover {
      background-color: #218838;
    }

    .delete-btn {
      background-color: #dc3545;
    }

    .delete-btn:hover {
      background-color: #c82333;
    }

    .empty-message {
      text-align: center;
      color: #666;
      padding: 2rem;
    }

    .quantity-input {
      width: 60px;
      padding: 0.25rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      text-align: center;
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
      margin: 1rem 0;
    }

    #qr-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
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

    .scan-result {
      padding: 1rem;
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      border-radius: 4px;
      margin: 1rem 0;
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
    }

    .toast.success {
      background-color: #28a745;
    }

    .toast.error {
      background-color: #dc3545;
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

  @property()
  declare containerId: string;

  @property()
  declare loadoutId: string;

  @property()
  declare mode: 'add-to-contents' | 'remove-from-contents' | 'create-loadout' | 'edit-loadout';

  @state()
  declare items: Array<{ id: string; name: string; qrData?: string; createdAt: string }>;

  @state()
  declare selectedQuantities: Map<string, number>;

  @state()
  declare isScanning: boolean;

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: 'success' | 'error';

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;

  constructor() {
    super();
    this.workspaceKey = '';
    this.containerId = '';
    this.loadoutId = '';
    this.mode = 'create-loadout';
    this.items = [];
    this.selectedQuantities = new Map();
    this.isScanning = false;
    this.toastMessage = '';
    this.toastType = 'success';
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScanning();
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItems();
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('workspaceKey') || changedProperties.has('mode') || changedProperties.has('containerId') || changedProperties.has('loadoutId')) {
      this.loadItems();
    }
  }

  private loadItems() {
    if (!this.workspaceKey) return;

    try {
      if (this.mode === 'remove-from-contents' && this.containerId) {
        // For remove mode, load items that are IN the container
        this.items = getItemContents(this.workspaceKey, this.containerId).map(content => ({
          id: content.id,
          name: content.name,
          qrData: undefined,
          createdAt: new Date().toISOString(),
        }));
      } else if (this.mode === 'edit-loadout' && this.loadoutId) {
        // For edit loadout mode, load items that are IN the loadout
        const loadout = getLoadout(this.workspaceKey, this.loadoutId);
        this.items = loadout.contents.map(content => ({
          id: content.id,
          name: content.name,
          qrData: undefined,
          createdAt: new Date().toISOString(),
        }));
      } else {
        // For add-to-contents and create-loadout modes, load all items in workspace
        this.items = getItems(this.workspaceKey);
      }
    } catch (error) {
      console.error('Failed to load items:', error);
      this.items = [];
    }
  }

  render() {
    const title = this.mode === 'add-to-contents' ? 'Add Items to Container' :
                  this.mode === 'remove-from-contents' ? 'Remove Items from Container' :
                  this.mode === 'create-loadout' ? 'Create Loadout' :
                  'Edit Loadout';

    return html`
      ${this.toastMessage ? html`
        <div class="toast ${this.toastType}">
          ${this.toastMessage}
        </div>
      ` : ''}

      <div class="header">
        <h2>${title}</h2>
        ${(this.mode === 'add-to-contents' || this.mode === 'remove-from-contents' || this.mode === 'create-loadout' || this.mode === 'edit-loadout') ? html`
          <button @click=${() => this.toggleScanning()}>${this.isScanning ? 'Stop Scan' : 'Scan QR'}</button>
        ` : ''}
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="list-container">
        ${this.isScanning ? html`
          <div class="scan-container">
            <video id="qr-video"></video>
            <div class="scanning-indicator">Scanning...</div>
          </div>
        ` : ''}

        ${this.mode === 'add-to-contents' || this.mode === 'remove-from-contents' || this.mode === 'create-loadout' || this.mode === 'edit-loadout' ? html`
          ${this.items.length > 0 ? html`
            ${this.items.map(item => html`
              <div class="list-item">
                <div class="item-info">
                  <div class="item-name">${item.name}</div>
                  <div class="item-meta">
                    ${item.qrData ? 'QR tagged' : 'Manual entry'}
                  </div>
                </div>
                <div class="item-actions">
                  ${(this.mode === 'add-to-contents' || this.mode === 'create-loadout') ? html`
                    <input type="number" class="quantity-input" min="1" value="1"
                      @change=${(e: Event) => this.selectedQuantities.set(item.id, parseInt((e.target as HTMLInputElement).value))}
                    />
                    ${this.mode === 'add-to-contents' ? html`
                      <button class="action-btn add-btn" @click=${() => this.addItemToContainer(item.id, item.name)}>Add</button>
                    ` : html`
                      <button class="action-btn add-btn" @click=${() => this.addItemToLoadout(item.id, item.name)}>Add</button>
                    `}
                  ` : html`
                    <button class="action-btn delete-btn" @click=${() => this.mode === 'remove-from-contents' ? this.removeItemFromContainer(item.id) : this.removeItemFromLoadout(item.id)}>Remove</button>
                  `}
                </div>
              </div>
            `)}
          ` : html`
            <div class="empty-message">
              ${this.mode === 'remove-from-contents' ? 'No items in container' :
                this.mode === 'edit-loadout' ? 'No items in loadout' :
                'No items yet'}
            </div>
          `}
        ` : ''}
      </div>
    `;
  }

  private addItemToContainer(itemId: string, itemName: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      const quantity = this.selectedQuantities.get(itemId) || 1;
      addItemToContents(this.workspaceKey, this.containerId, itemId, itemName, quantity);
      this.selectedQuantities.delete(itemId);
      this.showToast(`✓ Added ${itemName}`, 'success');
      // No need to reload since the item list doesn't change in add mode
    } catch (error) {
      console.error('Failed to add item to container:', error);
      this.showToast('Failed to add item', 'error');
    }
  }

  private removeItemFromContainer(itemId: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      removeItemFromContents(this.workspaceKey, this.containerId, itemId);
      this.loadItems();
      this.showToast('✓ Removed', 'success');
    } catch (error) {
      console.error('Failed to remove item from container:', error);
    }
  }

  private addItemToLoadout(itemId: string, itemName: string) {
    if (!this.workspaceKey || !this.loadoutId) return;

    try {
      const quantity = this.selectedQuantities.get(itemId) || 1;
      addItemToLoadout(this.workspaceKey, this.loadoutId, itemId, itemName, quantity);
      this.selectedQuantities.delete(itemId);
      this.showToast(`✓ Added ${itemName}`, 'success');
    } catch (error) {
      console.error('Failed to add item to loadout:', error);
      this.showToast('Failed to add item', 'error');
    }
  }

  private removeItemFromLoadout(itemId: string) {
    if (!this.workspaceKey || !this.loadoutId) return;

    try {
      removeItemFromLoadout(this.workspaceKey, this.loadoutId, itemId);
      this.loadItems();
      this.showToast('✓ Removed', 'success');
    } catch (error) {
      console.error('Failed to remove item from loadout:', error);
      this.showToast('Failed to remove item', 'error');
    }
  }

  private goBack() {
    this.stopScanning();

    if (this.mode === 'create-loadout') {
      // After creating, prompt for loadout name and go to loadouts manager
      this.promptLoadoutName();
    } else if (this.mode === 'edit-loadout') {
      // After editing, go back to loadouts manager
      this.dispatchEvent(new CustomEvent('navigate', {
        detail: {
          screen: 'loadouts-manager',
          context: { workspaceKey: this.workspaceKey }
        },
        bubbles: true,
        composed: true,
      }));
    } else {
      // For add/remove from contents, go back to object-inspect
      this.dispatchEvent(new CustomEvent('navigate', {
        detail: {
          screen: 'object-inspect',
          context: { object: this.containerId }
        },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private promptLoadoutName() {
    const title = prompt('Enter loadout name:');
    if (!title) {
      // If cancelled, go back to loadouts manager without saving
      this.dispatchEvent(new CustomEvent('navigate', {
        detail: {
          screen: 'loadouts-manager',
          context: { workspaceKey: this.workspaceKey }
        },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    try {
      const description = prompt('Enter loadout description (optional):') || '';

      // Get the selected items from the current state
      const contents = Array.from(this.selectedQuantities.entries()).map(([itemId, quantity]) => {
        const item = this.items.find(i => i.id === itemId);
        return {
          itemId,
          itemName: item?.name || '',
          quantity
        };
      });

      createLoadout(this.workspaceKey, title, description, contents);
      this.showToast(`✓ Created loadout "${title}"`, 'success');

      // Navigate to loadouts manager
      setTimeout(() => {
        this.dispatchEvent(new CustomEvent('navigate', {
          detail: {
            screen: 'loadouts-manager',
            context: { workspaceKey: this.workspaceKey }
          },
          bubbles: true,
          composed: true,
        }));
      }, 500);
    } catch (error) {
      console.error('Failed to create loadout:', error);
      this.showToast('Failed to create loadout', 'error');
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
      this.showToast(`Camera access denied: ${error}`, 'error');
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
      cancelAnimationFrame(this.scanningInterval);
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
          this.handleQRScan(code.data);
          return;
        }
      }

      this.scanningInterval = window.requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }

  private handleQRScan(qrData: string) {
    try {
      const item = findItemByQR(this.workspaceKey, qrData);

      if (!item) {
        this.showToast('QR code not found', 'error');
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
        return;
      }

      if (this.mode === 'add-to-contents') {
        // Add the found item to container
        const quantity = this.selectedQuantities.get(item.id) || 1;
        addItemToContents(this.workspaceKey, this.containerId, item.id, item.name, quantity);
        this.showToast(`✓ Added ${item.name}`, 'success');
      } else if (this.mode === 'remove-from-contents') {
        // Remove the found item from container
        removeItemFromContents(this.workspaceKey, this.containerId, item.id);
        this.showToast(`✓ Removed ${item.name}`, 'success');
      }

      // Reload items and keep scanning
      this.loadItems();
      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
    } catch (error) {
      this.showToast(`Error: ${error}`, 'error');
    }
  }

  private showToast(message: string, type: 'success' | 'error' = 'success') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = '';
    }, 2500);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'list-browser': ListBrowser;
  }
}
