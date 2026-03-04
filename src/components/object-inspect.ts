import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getItem, updateItemProperty, getItemContents } from '../services/storage.js';

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

  constructor() {
    super();
    this.objectId = '';
    this.workspaceKey = '';
    this.title = '';
    this.description = '';
    this.contents = [];
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
      this.loadContents();
    } catch (error) {
      console.error('Failed to load item:', error);
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
          <input type="file" accept="image/*" />
        </div>
        <div class="property">
          <label>Loadout</label>
          <select>
            <option>None</option>
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
          ${this.contents.length > 0 ? html`
            <div class="contents-list">
              ${this.contents.map(content => html`
                <div class="content-item">
                  <span class="content-item-name">${content.name}</span>
                  <span class="content-item-quantity">qty: ${content.quantity}</span>
                </div>
              `)}
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

  private saveAsLoadout() {
    alert('Save as loadout functionality');
  }

  private recheckInventory() {
    alert('Recheck inventory functionality');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'object-inspect': ObjectInspect;
  }
}
