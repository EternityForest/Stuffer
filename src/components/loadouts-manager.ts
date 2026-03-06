import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getLoadouts, deleteLoadout, getWorkspaceDoc} from '../services/storage.js';

@customElement('loadouts-manager')
export class LoadoutsManager extends LitElement {
  override createRenderRoot() {
    return this;
  }



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
      <div class="tool-bar">
        <h2>Loadouts</h2>
        <button @click=${() => this.createNewLoadout()}>Create Loadout</button>
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="flex-row gaps padding">
        ${this.loadouts.length > 0 ? this.loadouts.map(loadout => html`
          <div class="card">
            <h3>${loadout.title}</h3>
            ${loadout.description ? html`
              <div class="description">${loadout.description}</div>
            ` : ''}
            <div class="badge">${loadout.itemCount} item${loadout.itemCount !== 1 ? 's' : ''}</div>
            <div class="tool-bar">
              <button class="edit-btn" @click=${() => this.editLoadout(loadout.id)}>Edit</button>
              <button class="danger" @click=${() => this.deleteLoadout(loadout.id)}>Delete</button>
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
