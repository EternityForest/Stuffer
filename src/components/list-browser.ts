import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItemsOverview,
  getItemContents,
  addItemToContents,
  removeItemFromContents,
  createLoadout,
  getLoadout,
  addItemToLoadout,
  removeItemFromLoadout,
  lookupItemName,
  getWorkspaceDoc,
  getItem,
  resolveItemId,
  getCategories,
  getCategoryItemsOverview,
} from "../services/storage.js";
import jsQR from "jsqr";

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
  declare items: Array<{ id: string; name: string }>;

  @state()
  declare isScanning: boolean;

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: "success" | "error";

  @state()
  declare selectingContainer: boolean;

  @state()
  declare containerFilter: string;

  @state()
  declare containerList: Array<{ id: string; name: string }>;

  @state()
  declare containerName: string;

  @state()
  declare categories: Array<{ id: string; name: string }>;

  @state()
  declare selectedCategory: string;

  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;
  private boundGlobalTagScan: (event: Event) => void = () => {}
  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;
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
    this.items = [];
    this.isScanning = false;
    this.toastMessage = "";
    this.toastType = "success";
    this.selectingContainer = false;
    this.containerFilter = "";
    this.containerList = [];
    this.containerName = "";
    this.categories = [];
    this.selectedCategory = "all";
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScanning();
    this.cleanupYjsListener();
    globalThis.removeEventListener("globalTagScan", this.boundGlobalTagScan);
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadItems();
    this.loadCategories();
    this.setupYjsListener();  
    
    this.boundGlobalTagScan = this.globalTagScan.bind(this) as typeof this.boundGlobalTagScan
    globalThis.addEventListener("globalTagScan", this.boundGlobalTagScan );
  }


  globalTagScan(event: CustomEvent<{ qrData: string }>) {
    this.handleQRScan(event.detail.qrData);
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

  updated(changedProperties: Map<string, any>) {
    if (
      changedProperties.has("workspaceKey") ||
      changedProperties.has("mode") ||
      changedProperties.has("containerId") ||
      changedProperties.has("loadoutId") ||
      changedProperties.has("selectedCategory")
    ) {
      this.loadItems();
      if (changedProperties.has("containerId") && !this.selectingContainer) {
        this.loadContainerName();
      }
    }
  }

  private async loadItems() {
    if (!this.workspaceKey) return;

    try {
      if (this.selectingContainer) {
        // Load all items as containers
        this.containerList = await getItemsOverview(this.workspaceKey);
      } else if (this.mode === "remove-from-contents" && this.containerId) {
        // For remove mode, load items that are IN the container
        this.items = (
          await getItemContents(this.workspaceKey, this.containerId)
        ).map((content) => ({
          id: content.id,
          name: content.name,
          createdAt: new Date().toISOString(),
        }));
      } else if (this.mode === "edit-loadout" && this.loadoutId) {
        // For edit loadout mode, load items that are IN the loadout
        const loadout = await getLoadout(this.workspaceKey, this.loadoutId);
        this.items = loadout.contents;
      } else {
        // For add-to-contents and create-loadout modes, load all items in workspace
        if (this.selectedCategory !== "all") {
          this.items = await getCategoryItemsOverview(
            this.workspaceKey,
            this.selectedCategory
          );
        } else {
          this.items = await getItemsOverview(this.workspaceKey);
        }
      }
    } catch (error) {
      console.error("Failed to load items:", error);
      this.items = [];
      this.containerList = [];
    }
  }

  private async loadContainerName() {
    if (!this.workspaceKey || !this.containerId) return;
    try {
      const item = await getItem(this.workspaceKey, this.containerId);
      this.containerName = item.title;
    } catch (error) {
      console.error("Failed to load container name:", error);
      this.containerName = "";
    }
  }

  private async loadCategories() {
    if (!this.workspaceKey) return;

    try {
      this.categories = await getCategories(this.workspaceKey);
    } catch (error) {
      console.error("Failed to load categories:", error);
      this.categories = [];
    }
  }

  render() {
    const title =
      this.mode === "add-to-contents"
        ? "Add Items to Container"
        : this.mode === "remove-from-contents"
        ? "Remove Items from Container"
        : this.mode === "create-loadout"
        ? "Create Loadout"
        : "Edit Loadout";

    return html`
      ${this.toastMessage
        ? html`
            <div class="toast ${this.toastType}">${this.toastMessage}</div>
          `
        : ""}

      <div class="tool-bar">
        <h2>${title}</h2>
        ${this.selectingContainer
          ? html`
              <button @click=${() => this.cancelContainerSelection()}>
                Cancel
              </button>
            `
          : html`
              ${this.mode === "add-to-contents" ||
              this.mode === "remove-from-contents" ||
              this.mode === "create-loadout" ||
              this.mode === "edit-loadout"
                ? html`
                    <button @click=${() => this.toggleScanning()}>
                      ${this.isScanning ? "Stop Scan" : "Scan QR"}
                    </button>
                  `
                : ""}
              <button @click=${() => this.goBack()}>Back</button>
            `}
      </div>

      ${!this.selectingContainer &&
      (this.mode === "add-to-contents" || this.mode === "remove-from-contents")
        ? html`
            <div class="container-header">
              <div class="container-info">
                <strong>Container:</strong> ${this.containerName}
              </div>
              <div class="tool-bar">
                <button @click=${() => this.toggleMode()}>
                  ${this.mode === "add-to-contents"
                    ? "Switch to Remove"
                    : "Switch to Add"}
                </button>
                <button @click=${() => this.startContainerSelection()}>
                  Select Different Container
                </button>
              </div>
            </div>
          `
        : ""}
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
      ${this.isScanning
        ? html`
            <div class="scan-container w-100vw">
              <video id="qr-video"></video>
              <div class="scanning-indicator">Scanning...</div>
            </div>
          `
        : ""}
      <div class="flex-row gaps padding">
        ${this.selectingContainer
          ? html`
              <div class="container-selector">
                <input
                  type="text"
                  placeholder="Filter containers..."
                  @input=${(e: Event) =>
                    (this.containerFilter = (
                      e.target as HTMLInputElement
                    ).value)}
                  class="filter-input"
                />
                <div class="flex-row gaps padding">
                  ${this.getFilteredContainers().length > 0
                    ? html`
                        ${this.getFilteredContainers().map(
                          (container) => html`
                            <div class="card">
                              <div class="item-info">
                                <div class="item-name">${container.name}</div>
                              </div>
                              <div class="tool-bar">
                                <button
                                  class="action-btn add-btn"
                                  @click=${() =>
                                    this.selectContainer(
                                      container.id,
                                      container.name
                                    )}
                                >
                                  Select
                                </button>
                              </div>
                            </div>
                          `
                        )}
                      `
                    : html`
                        <div class="empty-message">No containers found</div>
                      `}
                </div>
              </div>
            `
          : html`
              ${this.mode === "add-to-contents" ||
              this.mode === "remove-from-contents" ||
              this.mode === "create-loadout" ||
              this.mode === "edit-loadout"
                ? html`
                    ${this.items.length > 0
                      ? html`
                          ${this.items.map(
                            (item) => html`
                              <div class="card">
                                <div class="item-info">
                                  <div class="item-name">${item.name}</div>
                                </div>
                                <div class="tool-bar">
                                  ${this.mode === "add-to-contents" ||
                                  this.mode === "create-loadout"
                                    ? html`
                                        ${this.mode === "add-to-contents"
                                          ? html`
                                              <button
                                                class="action-btn add-btn"
                                                @click=${() =>
                                                  this.addItemToContainer(
                                                    item.id,
                                                    item.name
                                                  )}
                                              >
                                                Add
                                              </button>
                                            `
                                          : html`
                                              <button
                                                class="action-btn add-btn"
                                                @click=${() =>
                                                  this.addItemToLoadout(
                                                    item.id,
                                                    item.name
                                                  )}
                                              >
                                                Add
                                              </button>
                                            `}
                                      `
                                    : html`
                                        <button
                                          class="action-btn danger"
                                          @click=${() =>
                                            this.mode === "remove-from-contents"
                                              ? this.removeItemFromContainer(
                                                  item.id
                                                )
                                              : this.removeItemFromLoadout(
                                                  item.id
                                                )}
                                        >
                                          Remove
                                        </button>
                                      `}
                                </div>
                              </div>
                            `
                          )}
                        `
                      : html`
                          <div class="empty-message">
                            ${this.mode === "remove-from-contents"
                              ? "No items in container"
                              : this.mode === "edit-loadout"
                              ? "No items in loadout"
                              : "No items yet"}
                          </div>
                        `}
                  `
                : ""}
            `}
      </div>
    `;
  }

  private async addItemToContainer(itemId: string, itemName: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      await addItemToContents(this.workspaceKey, this.containerId, itemId);
      this.showToast(`✓ Added ${itemName}`, "success");
      // No need to reload since the item list doesn't change in add mode
    } catch (error) {
      console.error("Failed to add item to container:", error);
      this.showToast("Failed to add item", "error");
    }
  }

  private removeItemFromContainer(itemId: string) {
    if (!this.workspaceKey || !this.containerId) return;

    try {
      removeItemFromContents(this.workspaceKey, this.containerId, itemId);
      this.loadItems();
      this.showToast("✓ Removed", "success");
    } catch (error) {
      console.error("Failed to remove item from container:", error);
    }
  }

  private addItemToLoadout(itemId: string, itemName: string) {
    if (!this.workspaceKey || !this.loadoutId) return;

    try {
      addItemToLoadout(this.workspaceKey, this.loadoutId, itemId);
      this.showToast(`✓ Added ${itemName}`, "success");
    } catch (error) {
      console.error("Failed to add item to loadout:", error);
      this.showToast("Failed to add item", "error");
    }
  }

  private removeItemFromLoadout(itemId: string) {
    if (!this.workspaceKey || !this.loadoutId) return;

    try {
      removeItemFromLoadout(this.workspaceKey, this.loadoutId, itemId);
      this.loadItems();
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
    this.containerFilter = "";
    this.loadItems();
  }

  private cancelContainerSelection() {
    this.selectingContainer = false;
    this.containerFilter = "";
    this.previousMode = null;
    this.loadItems();
  }

  private selectContainer(containerId: string, containerName: string) {
    this.containerId = containerId;
    this.containerName = containerName;
    this.selectingContainer = false;
    this.containerFilter = "";
    this.loadItems();
  }

  private getFilteredContainers() {
    const filter = this.containerFilter.toLowerCase();
    return this.containerList.filter((container) =>
      container.name.toLowerCase().includes(filter)
    );
  }

  private goBack() {
    this.stopScanning();

    if (this.mode === "create-loadout") {
      // After creating, prompt for loadout name and go to loadouts manager
      this.promptLoadoutName();
    } else if (this.mode === "edit-loadout") {
      // After editing, go back to loadouts manager
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
      // For add/remove from contents, go back to object-inspect
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

  private promptLoadoutName() {
    const title = prompt("Enter loadout name:");
    if (!title) {
      // If cancelled, go back to loadouts manager without saving
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

      // Get the selected items from the current state
      const contents = [];

      for (const item of this.items) {
        contents.push({ itemId: item.id });
      }

      createLoadout(this.workspaceKey, title, description, contents);
      this.showToast(`✓ Created loadout "${title}"`, "success");

      // Navigate to loadouts manager
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

  private toggleScanning() {
    if (this.isScanning) {
      this.stopScanning();
    } else {
      this.startScanning();
    }
  }

  private async startScanning() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.isScanning = true;
      this.requestUpdate();

      setTimeout(() => {
        this.videoElement = this.querySelector("#qr-video") as HTMLVideoElement;
        if (this.videoElement) {
          this.videoElement.srcObject = stream;
          this.videoElement.play();
          this.startQRScanning();
        }
      }, 0);
    } catch (error) {
      this.showToast(`Camera access denied: ${error}`, "error");
      this.isScanning = false;
    }
  }

  private stopScanning() {
    this.isScanning = false;
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      this.videoElement.srcObject = null;
    }
    if (this.scanningInterval !== null) {
      cancelAnimationFrame(this.scanningInterval);
      this.scanningInterval = null;
    }
  }

  private startQRScanning() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const scanFrame = () => {
      if (!this.isScanning || !this.videoElement || !ctx) return;

      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        ctx.drawImage(this.videoElement, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code) {
          this.handleQRScan(code.data);
          return;
        }
      }

      this.scanningInterval = window.requestAnimationFrame(scanFrame);
    };

    scanFrame();
  }

  private async handleQRScan(qrData: string) {
    try {
      const resolvedId = await resolveItemId(this.workspaceKey, qrData);
      const item = await getItem(this.workspaceKey, resolvedId);

      if (!item) {
        this.showToast("QR code not found", "error");
        if (this.isScanning && this.videoElement) {
          this.startQRScanning();
        }
        return;
      }

      const itemName = await lookupItemName(this.workspaceKey, resolvedId);

      if (this.selectingContainer) {
        // In container selection mode, select the scanned container
        this.selectContainer(resolvedId, itemName);
        this.stopScanning();
        return;
      }

      if (this.mode === "add-to-contents") {
        // Add the found item to container
        await addItemToContents(
          this.workspaceKey,
          this.containerId,
          resolvedId
        );

        this.showToast(`✓ Added ${itemName}`, "success");
      } else if (this.mode === "remove-from-contents") {
        // Remove the found item from container
        await removeItemFromContents(
          this.workspaceKey,
          this.containerId,
          resolvedId
        );
        this.showToast(`✓ Removed ${itemName}`, "success");
      }

      // Reload items and keep scanning
      this.loadItems();
      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
    } catch (error) {
      this.showToast(`Error: ${error}`, "error");
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
