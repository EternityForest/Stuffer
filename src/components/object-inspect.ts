import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getItem, updateItemProperty, getItemContents, getLoadouts, saveObjectAsLoadout, compareContentsToLoadout } from '../services/storage.js';
import { compressImage } from '../services/imageCompression.js';

@customElement('object-inspect')
export class ObjectInspect extends LitElement {
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
      padding: 1.5rem;
      flex: 1;
      overflow-y: auto;
    }

    .property {
      margin-bottom: 1.5rem;
    }

    .property label {
      display: block;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }

    .property input,
    .property textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: inherit;
      box-sizing: border-box;
    }

    .property textarea {
      resize: vertical;
      min-height: 100px;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .actions button {
      width: 100%;
    }

    .contents-section {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid #ddd;
    }

    .contents-section h3 {
      margin-top: 0;
      margin-bottom: 1rem;
    }

    .contents-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .content-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .content-item-name {
      font-weight: 500;
    }

    .content-item-quantity {
      font-size: 0.9rem;
      color: #666;
      margin-left: 1rem;
    }

    .empty-contents {
      color: #666;
      font-size: 0.9rem;
      padding: 1rem;
      text-align: center;
      background-color: #f8f9fa;
      border-radius: 4px;
    }

    h2 {
      margin-top: 0;
    }

    .image-preview {
      margin-top: 1rem;
      max-width: 100%;
      max-height: 300px;
      border-radius: 4px;
      object-fit: contain;
    }

    .image-upload-status {
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #666;
    }

    select {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: inherit;
      box-sizing: border-box;
    }

    .content-item.warning {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
    }

    .content-item.extra {
      background-color: #d1ecf1;
      border-left: 4px solid #17a2b8;
    }

    .warning-indicator {
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 0.5rem;
    }

    .warning-indicator.missing {
      color: #ffc107;
    }

    .warning-indicator.extra {
      color: #17a2b8;
    }
  `;

  @property()
  declare objectId: string;

  @property()
  declare workspaceKey: string;

  @state()
  declare title: string;

  @state()
  declare description: string;

  @state()
  declare contents: Array<{ id: string; name: string; quantity: number }>;

  @state()
  declare imageData: string | null;

  @state()
  declare isUploadingImage: boolean;

  @state()
  declare loadouts: Array<{ id: string; title: string; description: string; itemCount: number; createdAt: string }>;

  @state()
  declare selectedLoadout: string | null;

  @state()
  declare missingItems: Array<{ id: string; name: string; quantity: number }>;

  @state()
  declare extraItems: Array<{ id: string; name: string; quantity: number }>;

  constructor() {
    super();
    this.objectId = '';
    this.workspaceKey = '';
    this.title = '';
    this.description = '';
    this.contents = [];
    this.imageData = null;
    this.isUploadingImage = false;
    this.loadouts = [];
    this.selectedLoadout = null;
    this.missingItems = [];
    this.extraItems = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItem();
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('objectId') || changedProperties.has('workspaceKey')) {
      this.loadItem();
    }
  }

  private loadItem() {
    if (!this.objectId || !this.workspaceKey) return;

    try {
      const item = getItem(this.workspaceKey, this.objectId);
      this.title = item.title;
      this.description = item.description;
      this.imageData = (item as any).imageData || null;
      this.selectedLoadout = (item as any).selectedLoadout || null;
      this.loadContents();
      this.loadLoadouts();
      this.checkLoadoutMismatch();
    } catch (error) {
      console.error('Failed to load item:', error);
    }
  }

  private loadLoadouts() {
    if (!this.workspaceKey) return;

    try {
      this.loadouts = getLoadouts(this.workspaceKey);
    } catch (error) {
      console.error('Failed to load loadouts:', error);
      this.loadouts = [];
    }
  }

  private checkLoadoutMismatch() {
    if (!this.selectedLoadout) {
      this.missingItems = [];
      this.extraItems = [];
      return;
    }

    try {
      const comparison = compareContentsToLoadout(this.workspaceKey, this.objectId);
      this.missingItems = comparison.missing;
      this.extraItems = comparison.extra;
    } catch (error) {
      console.error('Failed to compare contents to loadout:', error);
      this.missingItems = [];
      this.extraItems = [];
    }
  }

  private loadContents() {
    try {
      this.contents = getItemContents(this.workspaceKey, this.objectId);
    } catch (error) {
      console.error('Failed to load contents:', error);
      this.contents = [];
    }
  }

  private saveTitle(e: Event) {
    const input = e.target as HTMLInputElement;
    this.title = input.value;
    try {
      updateItemProperty(this.workspaceKey, this.objectId, 'title', input.value);
    } catch (error) {
      console.error('Failed to save title:', error);
    }
  }

  private saveDescription(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    this.description = textarea.value;
    try {
      updateItemProperty(this.workspaceKey, this.objectId, 'description', textarea.value);
    } catch (error) {
      console.error('Failed to save description:', error);
    }
  }

  private async handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploadingImage = true;
    try {
      const compressedDataUrl = await compressImage(file);
      this.imageData = compressedDataUrl;
      updateItemProperty(this.workspaceKey, this.objectId, 'imageData', compressedDataUrl);
    } catch (error) {
      console.error('Failed to compress and save image:', error);
    } finally {
      this.isUploadingImage = false;
      // Clear the file input
      input.value = '';
    }
  }

  render() {
    return html`
      <div class="header">
        <h2>Object Details</h2>
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="content">
        <div class="property">
          <label>Title</label>
          <input type="text" placeholder="Object title" .value=${this.title} @change=${this.saveTitle} />
        </div>
        <div class="property">
          <label>Description</label>
          <textarea placeholder="Object notes and description" .value=${this.description} @change=${this.saveDescription}></textarea>
        </div>
        <div class="property">
          <label>Image</label>
          <input type="file" accept="image/*" @change=${(e: Event) => this.handleImageUpload(e)} ${this.isUploadingImage ? 'disabled' : ''} />
          ${this.isUploadingImage ? html`<div class="image-upload-status">Compressing image...</div>` : ''}
          ${this.imageData ? html`<img src=${this.imageData} alt="Item image" class="image-preview" />` : ''}
        </div>
        <div class="property">
          <label>Loadout</label>
          <select .value=${this.selectedLoadout || ''} @change=${this.selectLoadout}>
            <option value="">None</option>
            ${this.loadouts.map(loadout => html`
              <option value="${loadout.id}">${loadout.title}</option>
            `)}
          </select>
        </div>
        <div class="actions">
          <button @click=${() => this.addContents()}>Add Contents</button>
          <button @click=${() => this.removeContents()}>Remove Contents</button>
          <button @click=${() => this.saveAsLoadout()}>Save as Loadout</button>
          <button @click=${() => this.recheckInventory()}>Recheck Inventory</button>
        </div>

        <div class="contents-section">
          <h3>Contents</h3>
          ${this.missingItems.length > 0 || this.extraItems.length > 0 ? html`
            <div style="margin-bottom: 1rem; padding: 0.75rem; background-color: #f8f9fa; border-radius: 4px; font-size: 0.9rem;">
              ${this.missingItems.length > 0 ? html`
                <div style="color: #856404; margin-bottom: 0.5rem;">
                  ⚠️ Missing ${this.missingItems.length} item${this.missingItems.length !== 1 ? 's' : ''} from loadout
                </div>
              ` : ''}
              ${this.extraItems.length > 0 ? html`
                <div style="color: #004085;">
                  ℹ️ ${this.extraItems.length} extra item${this.extraItems.length !== 1 ? 's' : ''} not in loadout
                </div>
              ` : ''}
            </div>
          ` : ''}
          ${this.contents.length > 0 ? html`
            <div class="contents-list">
              ${this.contents.map(content => {
                const isMissing = this.selectedLoadout && this.missingItems.some(m => m.id === content.id);
                const isExtra = this.selectedLoadout && this.extraItems.some(e => e.id === content.id);
                const className = isMissing ? 'warning' : isExtra ? 'extra' : '';
                return html`
                  <div class="content-item ${className}">
                    <span class="content-item-name">${content.name}</span>
                    <span class="content-item-quantity">qty: ${content.quantity}
                      ${isMissing ? html`<span class="warning-indicator missing">⚠ missing from loadout</span>` : ''}
                      ${isExtra ? html`<span class="warning-indicator extra">ℹ extra</span>` : ''}
                    </span>
                  </div>
                `;
              })}
            </div>
          ` : html`
            <div class="empty-contents">No contents yet</div>
          `}
        </div>
      </div>
    `;
  }

  private goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'workspace-browser' },
      bubbles: true,
      composed: true,
    }));
  }

  private addContents() {
    // Navigate to list-browser to select items from workspace to add to this container
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'list-browser',
        context: { containerId: this.objectId, workspaceKey: this.workspaceKey, mode: 'add-to-contents' }
      },
      bubbles: true,
      composed: true,
    }));
  }

  private removeContents() {
    // Navigate to list-browser to select items currently in this container to remove
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'list-browser',
        context: { containerId: this.objectId, workspaceKey: this.workspaceKey, mode: 'remove-from-contents' }
      },
      bubbles: true,
      composed: true,
    }));
  }

  private selectLoadout(e: Event) {
    const select = e.target as HTMLSelectElement;
    const loadoutId = select.value || null;

    try {
      updateItemProperty(this.workspaceKey, this.objectId, 'selectedLoadout', loadoutId);
      this.selectedLoadout = loadoutId;
      this.checkLoadoutMismatch();
    } catch (error) {
      console.error('Failed to select loadout:', error);
    }
  }

  private saveAsLoadout() {
    const title = prompt('Enter loadout name:');
    if (!title) return;

    const description = prompt('Enter loadout description (optional):') || '';

    try {
      saveObjectAsLoadout(this.workspaceKey, this.objectId, title, description);
      this.loadLoadouts();
      alert(`✓ Saved as loadout "${title}"`);
    } catch (error) {
      console.error('Failed to save as loadout:', error);
      alert('Failed to save as loadout');
    }
  }

  private recheckInventory() {
    this.checkLoadoutMismatch();
    if (this.missingItems.length === 0 && this.extraItems.length === 0) {
      alert('✓ Inventory matches loadout perfectly!');
    } else {
      alert(`Missing: ${this.missingItems.length}, Extra: ${this.extraItems.length}`);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'object-inspect': ObjectInspect;
  }
}
