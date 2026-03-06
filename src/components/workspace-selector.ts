import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeYDoc, getWorkspacesMap, createWorkspace, deleteWorkspace } from '../services/storage.js';
import { enableWebRTC } from '../services/storage.js';

function reconnectWebRTC(workspaceKey: string) {
  if (workspaceKey) return;
  try {
    enableWebRTC(workspaceKey);
  } catch (error) {
    console.error('Failed to enable WebRTC:', error);
  }
}

@customElement('workspace-selector')
export class WorkspaceSelector extends LitElement {
  override createRenderRoot() {
    return this;
  }


  @state()
  declare workspaceName: string;

  @state()
  declare workspaces: Array<{ key: string; name: string }>;

  constructor() {
    super();
    this.workspaceName = '';
    this.workspaces = [];
  }

  async connectedCallback() {
    super.connectedCallback();
    await initializeYDoc();
    await this.loadWorkspaces();
  }

  private async loadWorkspaces() {
    try {
      const workspacesMap = await getWorkspacesMap();
      const workspacesList: Array<{ key: string; name: string }> = [];

      workspacesMap.forEach((workspace) => {
        workspacesList.push(workspace);
      });

      this.workspaces = workspacesList;
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      this.workspaces = [];
    }
  }

  private async handleCreate() {
    if (this.workspaceName.trim()) {
      await createWorkspace(this.workspaceName);
      this.workspaceName = '';
      await this.loadWorkspaces();
    }
  }

  private handleLoad(workspaceKey: string) {
    const workspace = this.workspaces.find(w => w.key === workspaceKey);
    if (workspace) {
      reconnectWebRTC(workspace.key);
      this.dispatchEvent(new CustomEvent('select-workspace', {
        detail: workspace.key,
        bubbles: true,
        composed: true,
      }));
    }
  }

  private async handleDelete(workspaceKey: string) {
    if (confirm('Are you sure you want to delete this workspace?')) {
      await deleteWorkspace(workspaceKey);
      await this.loadWorkspaces();
    }
  }

  render() {
    return html`
      <div class="content">
        <h1>Stuffer</h1>

        <h2>Create New Workspace</h2>
        <form @submit=${(e: Event) => { e.preventDefault(); this.handleCreate(); }}>
        <div class="tool-bar">  
        <input
            type="text"
            placeholder="Workspace Name"
            .value=${this.workspaceName}
            @input=${(e: Event) => { this.workspaceName = (e.target as HTMLInputElement).value; }}
          />
          <button type="submit">Create Workspace</button>
          </div>
        </form>

        <h2>Existing Workspaces</h2>
        <div class="workspaces-list">
          ${this.workspaces.length > 0 ? html`
            ${this.workspaces.map(workspace => html`
              <div class="card w-sm-full h-6rem">
                <header>
                  <div class="workspace-name">${workspace.name}</div>
                </header>
                
                <div class="tool-bar">
                  <button class="highlight" @click=${() => this.handleLoad(workspace.key)}>Load</button>
                  <button class="danger" @click=${() => this.handleDelete(workspace.key)}>Delete</button>
                </div>
              </div>
            `)}
          ` : html`
            <div class="empty-message">No workspaces yet. Create one above to get started.</div>
          `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'workspace-selector': WorkspaceSelector;
  }
}
