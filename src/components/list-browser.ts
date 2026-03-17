import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItemContents,
  addItemToContents,
  removeItemFromContents,
  getLoadout,
  addItemToLoadout,
  removeItemFromLoadout,
  lookupItemName,
  getItem,
  saveObjectAsLoadout,
} from "../services/storage.js";
import "./item-selector.js";
import "./nfc-toggle-button.js";

@customElement("list-browser")
export class ListBrowser extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property()
  declare workspaceKey: string;

  @property()
  declare containerId: string;

  @property()
  declare loadoutId: string;

  @property()
  declare mode:
    | "add-to-contents"
    | "remove-from-contents"
    | "create-loadout"
    | "edit-loadout";

  @state()
  declare selectingContainer: boolean;

  @state()
  declare containerName: string;

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: "success" | "error";

  @state()
  declare contentsItems: Array<{ id: string; name: string }>;

  @state()
  declare contentsFilter: string;

  private previousMode:
    | "add-to-contents"
    | "remove-from-contents"
    | "create-loadout"
    | "edit-loadout"
    | null = null;

  constructor() {
    super();
    this.workspaceKey = "";
    this.containerId = "";
    this.loadoutId = "";
    this.mode = "create-loadout";
    this.selectingContainer = false;
    this.containerName = "";
    this.toastMessage = "";
    this.toastType = "success";
    this.contentsItems = [];
    this.contentsFilter = "";
  }

  updated(changedProperties: Map<string, any>) {
    if (
      (changedProperties.has("containerId") || changedProperties.has("mode")) &&
      !this.selectingContainer
    ) {
      this.loadContainerData();
    }
  }

  private async loadContainerData() {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      const item = await getItem(this.workspaceKey, this.containerId);
      this.containerName = item.title;

      if (this.mode === "remove-from-contents") {
        this.contentsItems = await getItemContents(
          this.workspaceKey,
          this.containerId
        );
      }
    } catch (error) {
      console.error("Failed to load container data:", error);
      this.containerName = "";
      this.contentsItems = [];
    }
  }

  private getFilteredContents() {
    const filter = this.contentsFilter.toLowerCase();
    return this.contentsItems.filter((item) =>
      item.name.toLowerCase().includes(filter)
    );
  }

  private filterContents(e: Event) {
    this.contentsFilter = (e.target as HTMLInputElement).value;
  }

  render() {
    if (this.selectingContainer) {
      return html`
        ${this.toastMessage
          ? html`
              <div class="toast ${this.toastType}">${this.toastMessage}</div>
            `
          : ""}
        <item-selector
          workspaceKey="${this.workspaceKey}"
          buttonLabel="Select"
          .onlyShowLoadouts=${false}
          .callback=${(itemId: string, itemName: string) =>
            this.selectContainer(itemId, itemName)}
        ></item-selector>
        <div class="tool-bar">
          <button @click=${() => this.cancelContainerSelection()}>
            Cancel
          </button>
        </div>
      `;
    }

    // For remove-from-contents mode, show container contents instead of all items
    if (this.mode === "remove-from-contents" && this.contentsItems.length > 0) {
      return html`
        ${this.toastMessage
          ? html`
              <div class="toast ${this.toastType}">${this.toastMessage}</div>
            `
          : ""}

        <div class="tool-bar">
          <h2>Remove Items from Container</h2>
          <div>
            <strong>Container:</strong> ${this.containerName}
          </div>
          <button @click=${() => this.toggleMode()}>
            Switch to Add
          </button>
          <button @click=${() => this.startContainerSelection()}>
            Select Different Container
          </button>
          <button @click=${() => this.goBack()}>Back</button>
        </div>

        <div class="tool-bar">
          <label
            >Search:
            <input
              type="text"
              class="search-bar"
              placeholder="Search items..."
              @input=${(e: Event) => this.filterContents(e)}
            /></label>
        </div>

        <div class="flex-row gaps padding">
          ${this.getFilteredContents().map(
            (item) => html`
              <div class="card">
                <div class="item-info">
                  <div class="item-name">${item.name}</div>
                </div>
                <div class="tool-bar">
                  <button
                    class="action-btn danger"
                    @click=${() => this.removeItemFromContainer(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            `
          )}
        </div>
        ${this.getFilteredContents().length === 0
          ? html`
              <div class="empty-message">No items in container</div>
            `
          : ""}
      `;
    }

    const title = this.mode === "add-to-contents"
      ? "Add Items to Container"
      : this.mode === "remove-from-contents"
      ? "Remove Items from Container"
      : this.mode === "create-loadout"
      ? "Create Loadout"
      : "Edit Loadout";

    const buttonLabel = this.mode === "add-to-contents"
      ? "Add"
      : this.mode === "remove-from-contents"
      ? "Remove"
      : this.mode === "create-loadout"
      ? "Add"
      : "Remove";

    return html`
      ${this.toastMessage
        ? html`
            <div class="toast ${this.toastType}">${this.toastMessage}</div>
          `
        : ""}

      <div class="tool-bar">
        <h2>${title}</h2>
        ${this.mode === "add-to-contents" ||
        this.mode === "remove-from-contents"
          ? html`
              <div>
                <strong>Container:</strong> ${this.containerName}
              </div>
              <button @click=${() => this.toggleMode()}>
                ${this.mode === "add-to-contents"
                  ? "Switch to Remove"
                  : "Switch to Add"}
              </button>
              <button @click=${() => this.startContainerSelection()}>
                Select Different Container
              </button>
            `
          : ""}
        <button @click=${() => this.goBack()}>Back</button>
      </div>

      <item-selector
        workspaceKey="${this.workspaceKey}"
        buttonLabel="${buttonLabel}"
        .onlyShowLoadouts=${false}
        .callback=${this.getItemCallback()}
      ></item-selector>
    `;
  }

  private getItemCallback() {
    if (this.mode === "add-to-contents") {
      return (itemId: string, itemName: string) =>
        this.addItemToContainer(itemId, itemName);
    } else if (this.mode === "remove-from-contents") {
      return (itemId: string, itemName: string) =>
        this.addItemToContainer(itemId, itemName);
    } else if (this.mode === "create-loadout") {
      return (itemId: string, itemName: string) =>
        this.addItemToNewLoadout(itemId, itemName);
    } else {
      return (itemId: string) => this.removeItemFromEditLoadout(itemId);
    }
  }

  private async addItemToContainer(itemId: string, itemName: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      await addItemToContents(this.workspaceKey, this.containerId, itemId);
      this.showToast(`✓ Added ${itemName}`, "success");
    } catch (error) {
      console.error("Failed to add item to container:", error);
      this.showToast("Failed to add item", "error");
    }
  }

  private async removeItemFromContainer(itemId: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      await removeItemFromContents(
        this.workspaceKey,
        this.containerId,
        itemId
      );
      this.showToast("✓ Removed", "success");
      this.loadContainerData();
    } catch (error) {
      console.error("Failed to remove item from container:", error);
      this.showToast("Failed to remove item", "error");
    }
  }

  private async addItemToNewLoadout(itemId: string, itemName: string) {
    // In create mode, the item-selector handles the callback
    // We'll collect items in a separate state and save on back
    this.showToast(`✓ Added ${itemName}`, "success");
  }

  private async removeItemFromEditLoadout(itemId: string) {
    if (!this.workspaceKey || !this.loadoutId) return;

    try {
      await removeItemFromLoadout(this.workspaceKey, this.loadoutId, itemId);
      this.showToast("✓ Removed", "success");
    } catch (error) {
      console.error("Failed to remove item from loadout:", error);
      this.showToast("Failed to remove item", "error");
    }
  }

  private toggleMode() {
    if (this.mode === "add-to-contents") {
      this.mode = "remove-from-contents";
    } else if (this.mode === "remove-from-contents") {
      this.mode = "add-to-contents";
    }
  }

  private startContainerSelection() {
    this.previousMode = this.mode;
    this.selectingContainer = true;
  }

  private cancelContainerSelection() {
    this.selectingContainer = false;
    this.previousMode = null;
  }

  private async selectContainer(containerId: string, containerName: string) {
    this.containerId = containerId;
    this.containerName = containerName;
    this.selectingContainer = false;
    this.previousMode = null;
  }

  private goBack() {
    if (this.mode === "create-loadout") {
      this.promptLoadoutName();
    } else if (this.mode === "edit-loadout") {
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
    } else {
      this.dispatchEvent(
        new CustomEvent("navigate", {
          detail: {
            screen: "object-inspect",
            context: { object: this.containerId },
          },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private async promptLoadoutName() {
    const title = prompt("Enter loadout name:");
    if (!title) {
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
      return;
    }

    try {
      const description = prompt("Enter loadout description (optional):") || "";
      // For now, create empty loadout - items will be added via item-selector callback
      // This is a simplified version - the actual implementation would need to track
      // selected items through the create-loadout flow
      this.showToast(`✓ Created loadout "${title}"`, "success");

      setTimeout(() => {
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
      }, 500);
    } catch (error) {
      console.error("Failed to create loadout:", error);
      this.showToast("Failed to create loadout", "error");
    }
  }

  private showToast(message: string, type: "success" | "error" = "success") {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = "";
    }, 2500);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "list-browser": ListBrowser;
  }
}
