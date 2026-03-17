import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  getItemsOverview,
  getWorkspaceDoc,
  getCategories,
  getCategoryItemsOverview,
  getWorkspaceDoc as getWorkspaceDocExported,
  lookupItemName,
  resolveItemId,
  updateLastScanned,
} from "../services/storage.js";
import jsQR from "jsqr";

export type ItemSelectorCallback = (itemId: string, itemName: string) => void;

@customElement("item-selector")
export class ItemSelector extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property()
  declare workspaceKey: string;

  @property()
  declare buttonLabel: string;

  @property()
  declare onlyShowLoadouts: boolean;

  @property()
  declare callback: ItemSelectorCallback | null;

  @state()
  declare items: Array<{ id: string; name: string }>;

  @state()
  declare isScanning: boolean;

  @state()
  declare toastMessage: string;

  @state()
  declare toastType: "success" | "error";

  @state()
  declare categories: Array<{ id: string; name: string }>;

  @state()
  declare selectedCategory: string;

  @state()
  declare searchQuery: string;

  private prevSearchQuery = "";
  private videoElement: HTMLVideoElement | null = null;
  private scanningInterval: number | null = null;
  private boundGlobalTagScan: (event: Event) => void = () => {};
  private updateListener: ((update: Uint8Array, origin: any) => void) | null =
    null;

  constructor() {
    super();
    this.workspaceKey = "";
    this.buttonLabel = "Select";
    this.onlyShowLoadouts = false;
    this.callback = null;
    this.items = [];
    this.isScanning = false;
    this.toastMessage = "";
    this.toastType = "success";
    this.categories = [];
    this.selectedCategory = "all";
    this.searchQuery = "";
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

    this.boundGlobalTagScan = this.globalTagScan.bind(
      this
    ) as typeof this.boundGlobalTagScan;
    globalThis.addEventListener("globalTagScan", this.boundGlobalTagScan);
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
      changedProperties.has("onlyShowLoadouts") ||
      changedProperties.has("selectedCategory")
    ) {
      this.loadItems();
      if (changedProperties.has("onlyShowLoadouts")) {
        this.selectedCategory = "all";
      }
    }
  }

  private async loadItems() {
    if (!this.workspaceKey) return;

    try {
      let allItems;
      if (this.selectedCategory !== "all" && this.searchQuery.length == 0 && !this.onlyShowLoadouts) {
        allItems = await getCategoryItemsOverview(
          this.workspaceKey,
          this.selectedCategory
        );
      } else {
        allItems = await getItemsOverview(this.workspaceKey);
      }

      // Filter for loadouts if requested
      if (this.onlyShowLoadouts) {
        this.items = allItems.filter((item) => item.type === "loadout");
      } else {
        // Show all items when not filtering for loadouts
        this.items = allItems;
      }
    } catch (error) {
      console.error("Failed to load items:", error);
      this.items = [];
    }
  }

  private async loadCategories() {
    if (!this.workspaceKey) return;

    try {
      if (!this.onlyShowLoadouts) {
        this.categories = await getCategories(this.workspaceKey);
      } else {
        this.categories = [];
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
      this.categories = [];
    }
  }

  render() {
    if (this.prevSearchQuery.length > 0 != this.searchQuery.length > 0) {
      this.prevSearchQuery = this.searchQuery;
      this.loadItems();
    }

    const filteredItems = this.items.filter((obj) =>
      obj.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );

    return html`
      ${this.toastMessage
        ? html`
            <div class="toast ${this.toastType}">${this.toastMessage}</div>
          `
        : ""}

      <div class="tool-bar">
        <h2>${this.onlyShowLoadouts ? "Select Loadout" : "Select Item"}</h2>
        <nfc-toggle-button autostart="true"></nfc-toggle-button>
        <button @click=${() => this.toggleScanning()}>
          ${this.isScanning ? "Stop Scan" : "Scan QR"}
        </button>
      </div>

      ${!this.onlyShowLoadouts && this.categories.length > 0
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
              <video id="qr-video" style="max-height: 8rem"></video>
              <div class="scanning-indicator">Scanning...</div>
            </div>
          `
        : ""}

      <div class="tool-bar">
        <label
          >Search:
          <input
            type="text"
            class="search-bar"
            placeholder="Search items..."
            .value=${this.searchQuery}
            @input=${(e: Event) => {
              this.searchQuery = (e.target as HTMLInputElement).value;
            }}
          /></label>
      </div>

      ${filteredItems.length > 0
        ? html`
            <div class="flex-row gaps padding">
              ${filteredItems.map(
                (item) => html`
                  <div class="card">
                    <div class="item-info">
                      <div class="item-name">${item.name}</div>
                    </div>
                    <div class="tool-bar">
                      <button
                        class="action-btn add-btn"
                        @click=${() =>
                          this.selectItem(item.id, item.name)}
                      >
                        ${this.buttonLabel}
                      </button>
                    </div>
                  </div>
                `
              )}
            </div>
          `
        : html`
            <div class="empty-message">
              ${this.onlyShowLoadouts
                ? "No loadouts yet"
                : "No items yet"}
            </div>
          `}
    `;
  }

  private async selectItem(itemId: string, itemName: string) {
    if (this.callback) {
      this.callback(itemId, itemName);
      this.showToast(`✓ Selected ${itemName}`, "success");
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
      const itemName = await lookupItemName(this.workspaceKey, resolvedId);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            updateLastScanned(
              this.workspaceKey,
              qrData,
              position.coords.latitude,
              position.coords.longitude
            );
          },
          (error) => console.error(error)
        );
      } else {
        updateLastScanned(this.workspaceKey, qrData, 0, 0);
      }

      this.selectItem(resolvedId, itemName);

      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
    } catch (error) {
      this.showToast(`Error: ${error}`, "error");
      if (this.isScanning && this.videoElement) {
        this.startQRScanning();
      }
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
    "item-selector": ItemSelector;
  }
}
