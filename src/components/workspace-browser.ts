import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItemsOverview,
  getWorkspaceDoc,
  getWorkspacesMap,
  getCategories,
  getCategoryItemsOverview,
  getDefaultCategory,
  createLoadout,
} from "../services/storage.js";
import "./nfc-toggle-button.js";

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

  private prevSearchQuery = "";

  @state()
  declare objects: Array<{
    id: string;
    name: string;
    createdAt: string;
    inContainer?: string;
  }>;

  @state()
  declare categories: Array<{ id: string; name: string }>;

  @state()
  declare selectedCategory: string;

  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;

  constructor() {
    super();
    this.workspaceName = "";
    this.workspaceKey = "";
    this.searchQuery = "";
    this.objects = [];
    this.categories = [];
    this.selectedCategory = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItems();
    this.loadCategories();
    this.setupYjsListener();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupYjsListener();
  }

  private navigateToScanner() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "qr-scanner",
          context: { workspaceKey: this.workspaceKey },
        },
        bubbles: true,
        composed: true,
      })
    );
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

    if (this.selectedCategory === "") {
      this.selectedCategory = await getDefaultCategory(this.workspaceKey);
    }
    try {
      if (this.selectedCategory !== "all" && (this.searchQuery.length == 0)) {
        this.objects = await getCategoryItemsOverview(
          this.workspaceKey,
          this.selectedCategory
        );
      } else {
        this.objects = await getItemsOverview(this.workspaceKey);
      }
      this.workspaceName = (await getWorkspacesMap()).get(this.workspaceKey)
        ?.name as string;
    } catch (error) {
      console.error("Failed to load items:", error);
      this.objects = [];
    }
  }

  private async loadCategories() {
    if (!this.workspaceKey) return;

    try {
      this.categories = await getCategories(this.workspaceKey);
    } catch (error) {
      console.error("Failed to load categories:", error);
      this.categories = [];
      this.selectedCategory = "all";
    }
  }

  updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("workspaceKey") ||
      changedProperties.has("selectedCategory")
    ) {
      this.loadItems();
    }
  }

  render() {
    if ((this.prevSearchQuery.length > 0) != (this.searchQuery.length > 0)) {
      this.prevSearchQuery = this.searchQuery;
      this.loadItems();
    }

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
        <button @click=${() => this.navigateToScanner()}>Scanner</button>
        <nfc-toggle-button></nfc-toggle-button>
        <button @click=${() => this.navigateToQRSheets()}>QR Sheets</button>
        <button @click=${() => this.navigateToLoadouts()}>Loadouts</button>
        <button @click=${() => this.addLoadout()}>Add Loadout</button>
        <button @click=${() => this.navigateToSettings()}>Settings</button>
        <button @click=${() => this.dispatchNavigate("workspace-selector")}>
          Back
        </button>
      </div>

      ${this.categories.length > 0
        ? html`
            <div class="tool-bar">
              <button
                @click=${() => (this.selectedCategory = "all")}
                class="${this.selectedCategory === "all" ? "highlight" : ""}"
              >
                All Items
              </button>
              ${this.categories.map(
                (cat) => html`
                  <button
                    @click=${() => (this.selectedCategory = cat.id)}
                    class="${this.selectedCategory === cat.id
                      ? "highlight"
                      : ""}"
                  >
                    ${cat.name}
                  </button>
                `
              )}
            </div>
          `
        : ""}

      <div class="flex-row gaps padding">
        ${filteredObjects.map(
          (obj) => html`
            <div
              class="card w-sm-half"
              @click=${() => this.selectObject(obj.id)}
            >
              <h3>${obj.name}</h3>
              <div class="meta">
                ${obj.inContainer
                  ? html`<div class="in-container">At ${obj.inContainer}</div>`
                  : ""}
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

  private addLoadout() {
    const title = prompt("Enter loadout name:");
    if (!title) return;

    const description = prompt("Enter loadout description (optional):") || "";

    try {
      createLoadout(this.workspaceKey, title, description, []);
      alert(`✓ Created loadout "${title}"`);
    } catch (error) {
      console.error("Failed to create loadout:", error);
      alert("Failed to create loadout");
    }
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

  private navigateToQRSheets() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "layout-browser",
          context: {},
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
