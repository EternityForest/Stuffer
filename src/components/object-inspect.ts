import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItem,
  updateItemProperty,
  getItemContents,
  getLoadouts,
  saveObjectAsLoadout,
  compareContentsToLoadout,
  deleteItem,
  addAmountUpdate,
  getAmountUpdates,
  updateAmountUpdate,
  deleteAmountUpdate,
  calculateCurrentAmount,
  getWorkspaceDoc,
} from "../services/storage.js";
import { compressImage } from "../services/imageCompression.js";

@customElement("object-inspect")
export class ObjectInspect extends LitElement {
  override createRenderRoot() {
    return this;
  }


  @property()
  declare objectId: string;

  @property()
  declare workspaceKey: string;

  @state()
  declare title: string;

  @state()
  declare description: string;

  @state()
  declare contents: Array<{ id: string; name: string;}>;

  @state()
  declare imageData: string | null;

  @state()
  declare isUploadingImage: boolean;

  @state()
  declare loadouts: Array<{
    id: string;
    title: string;
    description: string;
    itemCount: number;
    createdAt: string;
  }>;

  @state()
  declare selectedLoadout: string | null;

  @state()
  declare missingItems: Array<{ id: string; name: string; quantity: number }>;

  @state()
  declare extraItems: Array<{ id: string; name: string; quantity: number }>;

  @state()
  declare amountUpdates: Array<{
    id: string;
    type: "set" | "delta";
    unit: string;
    quantity: number;
    timestamp: string;
  }>;

  @state()
  declare currentAmount: {
    amount: number;
    unit: string;
    error: string | null;
  } | null;

  @state()
  declare editingAmountUpdateId: string | null;

  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;

  constructor() {
    super();
    this.objectId = "";
    this.workspaceKey = "";
    this.title = "";
    this.description = "";
    this.contents = [];
    this.imageData = null;
    this.isUploadingImage = false;
    this.loadouts = [];
    this.selectedLoadout = null;
    this.missingItems = [];
    this.extraItems = [];
    this.amountUpdates = [];
    this.currentAmount = null;
    this.editingAmountUpdateId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItem();
    this.setupYjsListener();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupYjsListener();
  }

  private beginDelete() {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteItem(this.workspaceKey, this.objectId);
      this.goBack();
    }
  }
  private async setupYjsListener() {
      try {
        const yDoc = await getWorkspaceDoc(this.workspaceKey);
        this.updateListener = () => {
          this.loadItem();
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

  updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("objectId") ||
      changedProperties.has("workspaceKey")
    ) {
      this.loadItem();
    }
  }

  private async loadItem() {
    if (!this.objectId || !this.workspaceKey) return;

    try {
      const item = await getItem(this.workspaceKey, this.objectId);
      this.title = item.title;
      this.description = item.description;
      this.imageData = (item as any).imageData || null;
      this.selectedLoadout = item.selectedLoadout || null;
      this.loadContents();
      this.loadLoadouts();
      this.checkLoadoutMismatch();
      this.loadAmountData();
    } catch (error) {
      console.error("Failed to load item:", error);
    }
  }

  private async loadLoadouts() {
    if (!this.workspaceKey) return;

    try {
      this.loadouts = await  getLoadouts(this.workspaceKey);
    } catch (error) {
      console.error("Failed to load loadouts:", error);
      this.loadouts = [];
    }
  }

  private async checkLoadoutMismatch() {
    if (!this.selectedLoadout) {
      this.missingItems = [];
      this.extraItems = [];
      return;
    }

    try {
      const comparison = await compareContentsToLoadout(
        this.workspaceKey,
        this.objectId
      );
      this.missingItems = comparison.missing;
      this.extraItems = comparison.extra;
    } catch (error) {
      console.error("Failed to compare contents to loadout:", error);
      this.missingItems = [];
      this.extraItems = [];
    }
}

  private async loadContents() {
    try {
      this.contents = await getItemContents(this.workspaceKey, this.objectId);
    } catch (error) {
      console.error("Failed to load contents:", error);
      this.contents = [];
    }
  }

  private saveTitle(e: Event) {
    const input = e.target as HTMLInputElement;
    this.title = input.value;
    try {
      updateItemProperty(
        this.workspaceKey,
        this.objectId,
        "title",
        input.value
      );
    } catch (error) {
      console.error("Failed to save title:", error);
    }
  }

  private saveDescription(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    this.description = textarea.value;
    try {
      updateItemProperty(
        this.workspaceKey,
        this.objectId,
        "description",
        textarea.value
      );
    } catch (error) {
      console.error("Failed to save description:", error);
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
      updateItemProperty(
        this.workspaceKey,
        this.objectId,
        "imageData",
        compressedDataUrl
      );
    } catch (error) {
      console.error("Failed to compress and save image:", error);
    } finally {
      this.isUploadingImage = false;
      // Clear the file input
      input.value = "";
    }
  }

  private async loadAmountData() {
    try {
      this.amountUpdates = await getAmountUpdates(this.workspaceKey, this.objectId);
      calculateCurrentAmount(this.workspaceKey, this.objectId).then(
        (amount) => {
          this.currentAmount = amount;
        }
      );
    } catch (error) {
      console.error("Failed to load amount data:", error);
      this.amountUpdates = [];
      this.currentAmount = null;
    }
  }

  private addDelta() {
    const quantityStr = prompt("Enter quantity (can be negative for removal):");
    if (quantityStr === null) return;
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity)) {
      alert("Invalid quantity");
      return;
    }

    const unit = prompt("Enter unit (e.g., kg, L, pieces):");
    if (unit === null ) {
      return;
    }

    try {
      addAmountUpdate(
        this.workspaceKey,
        this.objectId,
        "delta",
        unit,
        quantity
      );
      this.loadAmountData();
    } catch (error) {
      console.error("Failed to add amount update:", error);
      alert("Failed to add amount update");
    }
  }

  private setAmount() {
    const quantityStr = prompt("Enter total quantity:");
    if (quantityStr === null) return;
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity) || quantity < 0) {
      alert("Invalid quantity");
      return;
    }

    const unit = prompt("Enter unit (e.g., kg, L, pieces):");
    if (unit === null || unit === "") {
      alert("Unit required");
      return;
    }

    try {
      addAmountUpdate(this.workspaceKey, this.objectId, "set", unit, quantity);
      this.loadAmountData();
    } catch (error) {
      console.error("Failed to set amount:", error);
      alert("Failed to set amount");
    }
  }

  private editAmountUpdate(updateId: string) {
    const update = this.amountUpdates.find((u) => u.id === updateId);
    if (!update) return;

    const quantityStr = prompt(
      "Enter new quantity:",
      update.quantity.toString()
    );
    if (quantityStr === null) return;
    const quantity = parseFloat(quantityStr);
    if (isNaN(quantity)) {
      alert("Invalid quantity");
      return;
    }

    const unit = prompt("Enter new unit:", update.unit);
    if (unit === null || unit === "") {
      alert("Unit required");
      return;
    }

    try {
      updateAmountUpdate(this.workspaceKey, this.objectId, updateId, {
        quantity,
        unit,
      });
      this.loadAmountData();
      this.editingAmountUpdateId = null;
    } catch (error) {
      console.error("Failed to update amount update:", error);
      alert("Failed to update amount");
    }
  }

  private deleteAmountUpdateEntry(updateId: string) {
    if (!confirm("Delete this amount entry?")) return;

    try {
      deleteAmountUpdate(this.workspaceKey, this.objectId, updateId);
      this.loadAmountData();
    } catch (error) {
      console.error("Failed to delete amount update:", error);
      alert("Failed to delete amount entry");
    }
  }

  render() {
    return html`
      <div class="header">
        <h2>Object Details</h2>
        <button @click=${() => this.beginDelete()} class="danger">
          Delete
        </button>
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="content">
        <div class="property">
          <label>Title</label>
          <input
            type="text"
            placeholder="Object title"
            .value=${this.title}
            @change=${this.saveTitle}
          />
        </div>
        <div class="property">
          <label>Description</label>
          <textarea
            placeholder="Object notes and description"
            .value=${this.description}
            @change=${this.saveDescription}
          ></textarea>
        </div>
        <div class="property">
          <label>Image</label>
          <input
            type="file"
            accept="image/*"
            @change=${(e: Event) => this.handleImageUpload(e)}
            ${this.isUploadingImage ? "disabled" : ""}
          />
          ${this.isUploadingImage
            ? html`<div class="image-upload-status">Compressing image...</div>`
            : ""}
          ${this.imageData
            ? html`<img
                src=${this.imageData}
                alt="Item image"
                class="image-preview"
              />`
            : ""}
        </div>
        <div class="property">
          <label>Loadout</label>
          <select @change=${this.selectLoadout}>
            <option value="" ?selected=${!this.selectedLoadout}>None</option>
            ${this.loadouts.map(
              (loadout) => html`
                <option
                  value="${loadout.id}"
                  ?selected=${this.selectedLoadout === loadout.id}
                >
                  ${loadout.title}
                </option>
              `
            )}
          </select>
        </div>

        <div class="amount-section">
          <h3>Amount Tracking</h3>
          ${this.currentAmount?.amount
            ? html`
                <div
                  class="amount-display ${this.currentAmount.error
                    ? "error"
                    : ""}"
                >
                  ${this.currentAmount.error
                    ? html`
                        <div class="amount-error">
                          ${this.currentAmount.error}
                        </div>
                      `
                    : html`
                        <div class="amount-value">
                          ${this.currentAmount.amount}
                          ${this.currentAmount.unit}
                        </div>
                      `}
                </div>
              `
            : html`
                <div class="amount-display">
                  <div style="color: #999;">No amount data</div>
                </div>
              `}
          <div class="amount-buttons">
            <button @click=${() => this.addDelta()}>Add/Remove Amount</button>
            <button @click=${() => this.setAmount()}>Set Amount</button>
          </div>
          <div class="amount-log">
            ${this.amountUpdates.length > 0
              ? html`
                  ${this.amountUpdates.map(
                    (update) => html`
                      <div class="amount-log-item">
                        <div class="amount-log-info">
                          <div>
                            <span class="amount-log-type ${update.type}"
                              >${update.type}</span
                            >
                            <span class="amount-log-quantity"
                              >${update.type === "delta" && update.quantity > 0
                                ? "+"
                                : ""}${update.quantity}</span
                            >
                            <span class="amount-log-unit">${update.unit}</span>
                          </div>
                          <div class="amount-log-timestamp">
                            ${new Date(update.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div class="amount-log-actions">
                          <button
                            @click=${() => this.editAmountUpdate(update.id)}
                          >
                            Edit
                          </button>
                          <button
                            @click=${() =>
                              this.deleteAmountUpdateEntry(update.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    `
                  )}
                `
              : html`
                  <div class="amount-log-empty">No amount updates yet</div>
                `}
          </div>
        </div>

        <div class="contents-section">
          <div class="actions">
            <button @click=${() => this.addContents()}>Add Contents</button>
            <button @click=${() => this.removeContents()}>
              Remove Contents
            </button>
            <button @click=${() => this.saveAsLoadout()}>
              Save as Loadout
            </button>
            <button @click=${() => this.recheckInventory()}>
              Recheck Inventory
            </button>
          </div>

          <h3>Contents</h3>
          ${this.missingItems.length > 0 || this.extraItems.length > 0
            ? html`
                <div
                  style="margin-bottom: 1rem; padding: 0.75rem; background-color: #f8f9fa; border-radius: 4px; font-size: 0.9rem;"
                >
                  ${this.missingItems.length > 0
                    ? html`
                        <div style="color: #856404; margin-bottom: 0.5rem;">
                          <div
                            style="font-weight: bold; margin-bottom: 0.25rem;"
                          >
                            ⚠️ Missing from loadout:
                          </div>
                          <div style="margin-left: 1rem;">
                            ${this.missingItems.map(
                              (item) => html`
                                <div>${item.name} (qty: ${item.quantity})</div>
                              `
                            )}
                          </div>
                        </div>
                      `
                    : ""}
                  ${this.extraItems.length > 0
                    ? html`
                        <div style="color: #004085;">
                          <div
                            style="font-weight: bold; margin-bottom: 0.25rem;"
                          >
                            ℹ️ Extra items not in loadout:
                          </div>
                          <div style="margin-left: 1rem;">
                            ${this.extraItems.map(
                              (item) => html`
                                <div>${item.name} (qty: ${item.quantity})</div>
                              `
                            )}
                          </div>
                        </div>
                      `
                    : ""}
                </div>
              `
            : ""}
          ${this.contents.length > 0
            ? html`
                <div class="contents-list">
                  ${this.contents.map((content) => {
                    const isMissing =
                      this.selectedLoadout &&
                      this.missingItems.some((m) => m.id === content.id);
                    const isExtra =
                      this.selectedLoadout &&
                      this.extraItems.some((e) => e.id === content.id);
                    const className = isMissing
                      ? "warning"
                      : isExtra
                      ? "extra"
                      : "";
                    return html`
                      <div class="content-item ${className}">
                        <span class="content-item-name">${content.name}</span>
                      </div>
                    `;
                  })}
                </div>
              `
            : html` <div class="empty-contents">No contents yet</div> `}
        </div>
      </div>
    `;
  }

  private goBack() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: "workspace-browser" },
        bubbles: true,
        composed: true,
      })
    );
  }

  private addContents() {
    // Navigate to list-browser to select items from workspace to add to this container
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "list-browser",
          context: {
            containerId: this.objectId,
            workspaceKey: this.workspaceKey,
            mode: "add-to-contents",
          },
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private removeContents() {
    // Navigate to list-browser to select items currently in this container to remove
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "list-browser",
          context: {
            containerId: this.objectId,
            workspaceKey: this.workspaceKey,
            mode: "remove-from-contents",
          },
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private selectLoadout(e: Event) {
    const select = e.target as HTMLSelectElement;
    const loadoutId = select.value === "" ? null : select.value;

    try {
      updateItemProperty(
        this.workspaceKey,
        this.objectId,
        "selectedLoadout",
        loadoutId
      );
      this.selectedLoadout = loadoutId;
      this.checkLoadoutMismatch();
    } catch (error) {
      console.error("Failed to select loadout:", error);
    }
  }

  private saveAsLoadout() {
    const title = prompt("Enter loadout name:");
    if (!title) return;

    const description = prompt("Enter loadout description (optional):") || "";

    try {
      saveObjectAsLoadout(this.workspaceKey, this.objectId, title, description);
      this.loadLoadouts();
      alert(`✓ Saved as loadout "${title}"`);
    } catch (error) {
      console.error("Failed to save as loadout:", error);
      alert("Failed to save as loadout");
    }
  }

  private recheckInventory() {
    this.checkLoadoutMismatch();
    if (this.missingItems.length === 0 && this.extraItems.length === 0) {
      alert("✓ Inventory matches loadout perfectly!");
    } else {
      alert(
        `Missing: ${this.missingItems.length}, Extra: ${this.extraItems.length}`
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "object-inspect": ObjectInspect;
  }
}
