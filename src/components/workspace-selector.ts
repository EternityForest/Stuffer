import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { initializeYDoc, getWorkspacesMap, createWorkspace, deleteWorkspace } from '../services/storage.js';

@customElement('workspace-selector')
export class WorkspaceSelector extends LitElement {
  static createRenderRoot() {
    return this;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 2rem;
    }

    .content {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
    }

    h1 {
      margin-bottom: 2rem;
      text-align: center;
    }

    h2 {
      font-size: 1.2rem;
      margin-bottom: 1rem;
      margin-top: 2rem;
    }

    h2:first-of-type {
      margin-top: 0;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
      background-color: #f8f9fa;
      border-radius: 4px;
      margin-bottom: 2rem;
    }

    input {
      padding: 0.75rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 1rem;
    }

    button {
      padding: 0.75rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
    }

    button:hover {
      background-color: #0056b3;
    }

    .workspaces-list {
      flex: 1;
      overflow-y: auto;
    }

    .workspace-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 0.5rem;
      background-color: white;
    }

    .workspace-item:hover {
      background-color: #f8f9fa;
    }

    .workspace-name {
      font-weight: 500;
    }

    .workspace-key {
      font-size: 0.85rem;
      color: #666;
      margin-top: 0.25rem;
    }

    .workspace-actions {
      display: flex;
      gap: 0.5rem;
    }

    .load-btn {
      background-color: #28a745;
      padding: 0.5rem 1rem;
      font-size: 0.9rem;
    }

    .load-btn:hover {
      background-color: #218838;
    }

    .delete-btn {
      background-color: #dc3545;
      padding: 0.5rem 1rem;
      font-size: 0.9rem;
    }

    .delete-btn:hover {
      background-color: #c82333;
    }

    .empty-message {
      text-align: center;
      color: #666;
      padding: 2rem;
    }
  `;

  @state()
  declare workspaceName: string;

  @state()
  declare syncKey: string;

  @state()
  declare workspaces: Array<{ key: string; name: string }>;

  constructor() {
    super();
    this.workspaceName = '';
    this.syncKey = '';
    this.workspaces = [];
  }

  async connectedCallback() {
    super.connectedCallback();
    await initializeYDoc();
    this.loadWorkspaces();
  }

  private loadWorkspaces() {
    try {
      const workspacesMap = getWorkspacesMap();
      const workspacesList: Array<{ key: string; name: string }> = [];

      workspacesMap.forEach((workspace, key) => {
        const name = workspace.get('name') as string || key;
        workspacesList.push({ key, name });
      });

      this.workspaces = workspacesList;
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      this.workspaces = [];
    }
  }

  private handleCreate() {
    if (this.workspaceName.trim()) {
      const key = createWorkspace(this.workspaceName, this.syncKey || undefined);
      this.workspaceName = '';
      this.syncKey = '';
      this.loadWorkspaces();
    }
  }

  private handleLoad(workspaceKey: string) {
    const workspace = this.workspaces.find(w => w.key === workspaceKey);
    if (workspace) {
      this.dispatchEvent(new CustomEvent('select-workspace', {
        detail: workspace.key,
        bubbles: true,
        composed: true,
      }));
    }
  }

  private handleDelete(workspaceKey: string) {
    if (confirm('Are you sure you want to delete this workspace?')) {
      deleteWorkspace(workspaceKey);
      this.loadWorkspaces();
    }
  }

  render() {
    return html`
      <div class="content">
        <h1>Stuffer</h1>

        <h2>Create New Workspace</h2>
        <form @submit=${(e: Event) => { e.preventDefault(); this.handleCreate(); }}>
          <input
            type="text"
            placeholder="Workspace Name"
            .value=${this.workspaceName}
            @input=${(e: Event) => { this.workspaceName = (e.target as HTMLInputElement).value; }}
          />
          <input
            type="text"
            placeholder="Sync Key (optional)"
            .value=${this.syncKey}
            @input=${(e: Event) => { this.syncKey = (e.target as HTMLInputElement).value; }}
          />
          <button type="submit">Create Workspace</button>
        </form>

        <h2>Existing Workspaces</h2>
        <div class="workspaces-list">
          ${this.workspaces.length > 0 ? html`
            ${this.workspaces.map(workspace => html`
              <div class="workspace-item">
                <div>
                  <div class="workspace-name">${workspace.name}</div>
                  <div class="workspace-key">${workspace.key}</div>
                </div>
                <div class="workspace-actions">
                  <button class="load-btn" @click=${() => this.handleLoad(workspace.key)}>Load</button>
                  <button class="delete-btn" @click=${() => this.handleDelete(workspace.key)}>Delete</button>
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
