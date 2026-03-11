import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("nfc-toggle-button")
export class NfcToggleButton extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @state()
  declare ndef: NDEFReader | null;

  @state()
  declare nfcAbort: AbortController | null;

  constructor() {
    super();
    this.nfcAbort = (globalThis.nfcabort as AbortController) || null;
    this.ndef = globalThis.nfcreader || null;
  }

  private async toggleNfc() {
    if (this.nfcAbort) {
      this.nfcAbort.abort();
      this.nfcAbort = null;
      this.ndef = null;
      globalThis.nfcreader = null;
      globalThis.nfcabort = null;
      alert("NFC scanning stopped");
      this.requestUpdate();
      return;
    }
    try {
      this.nfcAbort = new AbortController();
      globalThis.nfcabort = this.nfcAbort;

      const ndef = new NDEFReader();
      await ndef.scan();

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
      alert(e);
      console.error(e);
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
