import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

let userEnabledBackgroundNfc = false;

@customElement("nfc-toggle-button")
export class NfcToggleButton extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Boolean })
  declare autostart: boolean;

  @state()
  declare ndef: NDEFReader | null;

  @state()
  declare nfcAbort: AbortController | null;

  @state()
  declare shouldContinueAfterDisconnect: boolean;

  constructor() {
    super();
    this.nfcAbort = (globalThis.nfcabort as AbortController) || null;
    this.ndef = globalThis.nfcreader || null;

    this.shouldContinueAfterDisconnect = this.nfcAbort !== null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.autostart) {
      if (this.nfcAbort === null) {
        this.toggleNfc(false);
      }
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.shouldContinueAfterDisconnect) {
      if (this.nfcAbort) {
        this.toggleNfc();
      }
    }
  }

  private async toggleNfc(doAlerts: boolean = true) {
    if (this.nfcAbort) {
      this.nfcAbort.abort();
      this.nfcAbort = null;
      this.ndef = null;
      globalThis.nfcreader = null;
      globalThis.nfcabort = null;
      this.shouldContinueAfterDisconnect = false;
      this.requestUpdate();
      return;
    }
    try {
      const ac = new AbortController();

      const ndef = new NDEFReader();
      await ndef.scan();      
      globalThis.nfcabort = this.nfcAbort;
      this.nfcAbort = ac;
      this.shouldContinueAfterDisconnect = true;

      ndef.addEventListener("readingerror", () => {
        alert("Argh! Cannot read data from the NFC tag. Try another one?");
        console.error("Argh! Cannot read data from the NFC tag.");
      });

      ndef.addEventListener("reading", ({ _message, serialNumber }) => {
        globalThis.dispatchEvent(
          new CustomEvent<{ qrData: string }>("globalTagScan", {
            detail: { qrData: "nfc-id://" + serialNumber },
          })
        );
      });
    } catch (e) {      
      console.error(e);
      if (!doAlerts) return;
      alert(e);
    }

    this.requestUpdate();
  }

  render() {
    return html`
      <button
        @click=${() => this.toggleNfc()}
        style="height: 100%"
        class="${this.nfcAbort ? "highlight" : ""}"
      >
        NFC
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "nfc-toggle-button": NfcToggleButton;
  }
}
