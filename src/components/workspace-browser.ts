import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getItems } from '../services/storage.js';

@customElement('workspace-browser')
export class WorkspaceBrowser extends LitElement {
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

    .search-bar {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
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

    .objects-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      padding: 1rem;
    }

    .object-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s;
    }

    .object-card:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .object-card h3 {
      margin-top: 0;
      margin-bottom: 0.5rem;
    }

    .object-card .meta {
      font-size: 0.85rem;
      color: #666;
    }

    .loadout-status {
      font-size: 0.8rem;
      margin-top: 0.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      background-color: #e7f3ff;
      color: #004085;
    }

    .loadout-warning {
      font-size: 0.8rem;
      margin-top: 0.25rem;
      color: #856404;
      font-weight: bold;
    }
  `;

  @property()
  declare workspaceName: string;

  @property()
  declare workspaceKey: string;

  @state()
  declare searchQuery: string;

  @state()
  declare objects: Array<{ id: string; name: string; createdAt: string }>;

  private updateListener: ((update: Uint8Array, origin: any) => void) | null = null;

  constructor() {
    super();
    this.workspaceName = '';
    this.workspaceKey = '';
    this.searchQuery = '';
    this.objects = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItems();
    this.setupYjsListener();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupYjsListener();
  }

  private setupYjsListener() {
    import('../services/storage.js').then(({ getYDoc }) => {
      try {
        const yDoc = getYDoc();
        this.updateListener = () => {
          this.loadItems();
          this.requestUpdate();
        };
        yDoc.on('update', this.updateListener);
      } catch (error) {
        console.error('Failed to subscribe to Yjs updates:', error);
      }
    });
  }

  private cleanupYjsListener() {
    if (this.updateListener) {
      import('../services/storage.js').then(({ getYDoc }) => {
        try {
          const yDoc = getYDoc();
          yDoc.off('update', this.updateListener!);
          this.updateListener = null;
        } catch (error) {
          console.error('Failed to unsubscribe from Yjs updates:', error);
        }
      });
    }
  }

  private loadItems() {
    if (!this.workspaceKey) return;

    try {
      this.objects = getItems(this.workspaceKey);
    } catch (error) {
      console.error('Failed to load items:', error);
      this.objects = [];
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('workspaceKey')) {
      this.loadItems();
    }
  }

  render() {
    const filteredObjects = this.objects.filter(obj =>
      obj.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    return html`
      <div class="header">
        <input
          type="text"
          class="search-bar"
          placeholder="Search items..."
          .value=${this.searchQuery}
          @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; }}
        />
        <button @click=${() => this.addItem()}>Add Item</button>
        <button @click=${() => this.navigateToLoadouts()}>Loadouts</button>
        <button @click=${() => this.navigateToSettings()}>Settings</button>
        <button @click=${() => this.dispatchNavigate('workspace-selector')}>Back</button>
      </div>
      <div class="objects-grid">
        ${filteredObjects.map(obj => html`
          <div class="object-card" @click=${() => this.selectObject(obj.id)}>
            <h3>${obj.name}</h3>
            <div class="meta">
              <div>${new Date(obj.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        `)}
        ${filteredObjects.length === 0 ? html`
          <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">
            ${this.objects.length === 0
              ? 'No items yet. Add one to get started.'
              : 'No items match your search.'}
          </div>
        ` : ''}
      </div>
    `;
  }

  private addItem() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'add-remove-item', context: { workspace: this.workspaceKey } },
      bubbles: true,
      composed: true,
    }));
  }

  private selectObject(objectId: string) {
    this.dispatchEvent(new CustomEvent('select-object', {
      detail: objectId,
      bubbles: true,
      composed: true,
    }));
  }

  private navigateToLoadouts() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'loadouts-manager',
        context: { workspaceKey: this.workspaceKey }
      },
      bubbles: true,
      composed: true,
    }));
  }

  private navigateToSettings() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'workspace-settings',
        context: { workspaceKey: this.workspaceKey }
      },
      bubbles: true,
      composed: true,
    }));
  }



  private dispatchNavigate(screen: string) {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'workspace-browser': WorkspaceBrowser;
  }
}
