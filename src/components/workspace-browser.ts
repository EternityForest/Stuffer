import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getItems, getWorkspaceDoc, getWorkspacesMap } from "../services/storage.js";

@customElement("workspace-browser")
export class WorkspaceBrowser extends LitElement {
  override createRenderRoot() {
    return this;
  }


  @property()
  declare workspaceName: string;

  @property()
  declare workspaceKey: string;

  @state()
  declare searchQuery: string;

  @state()
  declare objects: Array<{ id: string; name: string; createdAt: string }>;

  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;

  constructor() {
    super();
    this.workspaceName = "";
    this.workspaceKey = "";
    this.searchQuery = "";
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

  private async setupYjsListener() {
      try {
        const yDoc = await getWorkspaceDoc(this.workspaceKey);
        this.updateListener = () => {
          this.loadItems();
          this.requestUpdate();
        };
        yDoc.on("update", this.updateListener);
      } catch (error) {
        console.error("Failed to subscribe to Yjs updates:", error);
      }
  }

  private async cleanupYjsListener() {
    if (this.updateListener) {
      try {
        const yDoc = await getWorkspaceDoc(this.workspaceKey);
        yDoc.off("update", this.updateListener!);
        this.updateListener = null;
      } catch (error) {
        console.error("Failed to unsubscribe from Yjs updates:", error);
      }
    }
  }

  private async loadItems() {
    if (!this.workspaceKey) return;

    try {
      this.objects = await getItems(this.workspaceKey);

      this.workspaceName = (await getWorkspacesMap()).get(this.workspaceKey)?.name
    } catch (error) {
      console.error("Failed to load items:", error);
      this.objects = [];
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("workspaceKey")) {
      this.loadItems();
    }
  }

  render() {
    const filteredObjects = this.objects.filter((obj) =>
      obj.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    

    return html`
      <div class="tool-bar">
      <p>Stuffer: ${this.workspaceName}</p>
        <input
          type="text"
          class="search-bar"
          placeholder="Search items..."
          .value=${this.searchQuery}
          @input=${(e: Event) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
          }}
        />
        <button @click=${() => this.addItem()}>Add Item</button>
        <button @click=${() => this.navigateToLoadouts()}>Loadouts</button>
        <button @click=${() => this.navigateToSettings()}>Settings</button>
        <button @click=${() => this.dispatchNavigate("workspace-selector")}>
          Back
        </button>
      </div>
      <div class="flex-row gaps padding">
        ${filteredObjects.map(
          (obj) => html`
            <div class="card w-sm-half" @click=${() => this.selectObject(obj.id)}>
              <h3>${obj.name}</h3>
              <div class="meta">
                <div>${new Date(obj.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          `
        )}
        ${filteredObjects.length === 0
          ? html`
              <div
                style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;"
              >
                ${this.objects.length === 0
                  ? "No items yet. Add one to get started."
                  : "No items match your search."}
              </div>
            `
          : ""}
      </div>
    `;
  }

  private addItem() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "add-remove-item",
          context: { workspace: this.workspaceKey },
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private selectObject(objectId: string) {
    this.dispatchEvent(
      new CustomEvent("select-object", {
        detail: objectId,
        bubbles: true,
        composed: true,
      })
    );
  }

  private navigateToLoadouts() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "loadouts-manager",
          context: { workspaceKey: this.workspaceKey },
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private navigateToSettings() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "workspace-settings",
          context: { workspaceKey: this.workspaceKey },
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private dispatchNavigate(screen: string) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-browser": WorkspaceBrowser;
  }
}
