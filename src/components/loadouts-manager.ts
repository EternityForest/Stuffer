import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getLoadouts, deleteLoadout, getWorkspaceDoc} from '../services/storage.js';

@customElement('loadouts-manager')
export class LoadoutsManager extends LitElement {
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

    .loadouts-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
      padding: 1rem;
    }

    .loadout-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 1rem;
      cursor: pointer;
      transition: box-shadow 0.2s;
      display: flex;
      flex-direction: column;
    }

    .loadout-card:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .loadout-card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }

    .loadout-card .description {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 0.5rem;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .loadout-card .meta {
      font-size: 0.8rem;
      color: #999;
      margin-bottom: 0.75rem;
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
    }

    .edit-btn {
      flex: 1;
      padding: 0.4rem 0.5rem;
      background-color: #28a745;
      font-size: 0.85rem;
      white-space: nowrap;
    }

    .edit-btn:hover {
      background-color: #218838;
    }

    .delete-btn {
      padding: 0.4rem 0.5rem;
      background-color: #dc3545;
      font-size: 0.85rem;
    }

    .delete-btn:hover {
      background-color: #c82333;
    }

    .empty-message {
      grid-column: 1/-1;
      text-align: center;
      padding: 2rem;
      color: #666;
    }
  `;

  @property()
  declare workspaceKey: string;

  @state()
  declare loadouts: Array<{ id: string; title: string; description: string; itemCount: number; createdAt: string }>;

  private updateListener: ((update: Uint8Array, origin: any) => void) | null = null;

  constructor() {
    super();
    this.workspaceKey = '';
    this.loadouts = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadLoadouts();
    this.setupYjsListener();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupYjsListener();
  }

  private async setupYjsListener() {
      try {
        const yDoc = await getWorkspaceDoc(this.workspaceKey);
        this.updateListener = () => {
          this.loadLoadouts();
          this.requestUpdate();
        };
        yDoc.on('update', this.updateListener);
      } catch (error) {
        console.error('Failed to subscribe to Yjs updates:', error);
      }
  }

  private async cleanupYjsListener() {
    if (this.updateListener) {
        try {
          const yDoc = await getWorkspaceDoc(this.workspaceKey);
          yDoc.off('update', this.updateListener!);
          this.updateListener = null;
        } catch (error) {
          console.error('Failed to unsubscribe from Yjs updates:', error);
        }
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('workspaceKey')) {
      this.loadLoadouts();
    }
  }

  private async loadLoadouts() {
    if (!this.workspaceKey) return;

    try {
      this.loadouts = await getLoadouts(this.workspaceKey);
    } catch (error) {
      console.error('Failed to load loadouts:', error);
      this.loadouts = [];
    }
  }

  render() {
    return html`
      <div class="header">
        <h2>Loadouts</h2>
        <button @click=${() => this.createNewLoadout()}>Create Loadout</button>
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="loadouts-grid">
        ${this.loadouts.length > 0 ? this.loadouts.map(loadout => html`
          <div class="loadout-card">
            <h3>${loadout.title}</h3>
            ${loadout.description ? html`
              <div class="description">${loadout.description}</div>
            ` : ''}
            <div class="meta">${loadout.itemCount} item${loadout.itemCount !== 1 ? 's' : ''}</div>
            <div class="card-actions">
              <button class="edit-btn" @click=${() => this.editLoadout(loadout.id)}>Edit</button>
              <button class="delete-btn" @click=${() => this.deleteLoadout(loadout.id)}>Delete</button>
            </div>
          </div>
        `) : html`
          <div class="empty-message">No loadouts yet. Create one to get started.</div>
        `}
      </div>
    `;
  }

  private createNewLoadout() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'list-browser',
        context: {
          workspaceKey: this.workspaceKey,
          mode: 'create-loadout'
        }
      },
      bubbles: true,
      composed: true,
    }));
  }

  private editLoadout(loadoutId: string) {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: {
        screen: 'list-browser',
        context: {
          workspaceKey: this.workspaceKey,
          loadoutId,
          mode: 'edit-loadout'
        }
      },
      bubbles: true,
      composed: true,
    }));
  }

  private deleteLoadout(loadoutId: string) {
    if (!confirm('Delete this loadout?')) return;

    try {
      deleteLoadout(this.workspaceKey, loadoutId);
      this.loadLoadouts();
    } catch (error) {
      console.error('Failed to delete loadout:', error);
      alert('Failed to delete loadout');
    }
  }

  private goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'workspace-browser' },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'loadouts-manager': LoadoutsManager;
  }
}
