import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { StickerLayout } from '../models/layout.js';
import { generateItemId } from '../services/uuid.js';
import QRCode from 'qrcode';

@customElement('qr-sheet-creator')
export class QRSheetCreator extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @state()
  declare layout: StickerLayout | null;

  @state()
  declare qrCodes: Array<{ id: string; dataUrl: string }>;

  @state()
  declare isGenerating: boolean;

  constructor() {
    super();
    this.layout = null;
    this.qrCodes = [];
    this.isGenerating = false;
  }

  setLayout(layout: StickerLayout) {
    this.layout = layout;
    this.generateSheet();
  }

  private async generateSheet() {
    if (!this.layout) return;

    this.isGenerating = true;
    const qrCodes: Array<{ id: string; dataUrl: string }> = [];
    const totalStickers = this.layout.rowCount * this.layout.colCount;

    for (let i = 0; i < totalStickers; i++) {
      const id = generateItemId();
      const dataUrl = await QRCode.toDataURL(id, {
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      qrCodes.push({ id, dataUrl });
    }

    this.qrCodes = qrCodes;
    this.isGenerating = false;
  }

  static styles = css`
    :host {
      display: block;
    }

    .toolbar {
      display: flex;
      gap: 10px;
      padding: 20px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      align-items: center;
    }

    button {
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    button:hover {
      background: #0056b3;
    }

    button.secondary {
      background: #6c757d;
    }

    button.secondary:hover {
      background: #5a6268;
    }

    .layout-info {
      flex: 1;
      font-size: 14px;
      color: #666;
    }

    .print-container {
      padding: 20px;
      display: flex;
      justify-content: center;
    }

    .sheet {
      background: white;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      position: relative;
      overflow: hidden;
    }

    .sticker-grid {
      display: grid;
      gap: 0;
      padding: 0;
      margin: 0;
    }

    .sticker {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: white;
      border: 1px solid #e0e0e0;
    }

    .sticker img {
      max-width: 90%;
      max-height: 90%;
      display: block;
    }

    .loading {
      padding: 40px;
      text-align: center;
      color: #666;
    }

    @media print {
      * {
        margin: 0;
        padding: 0;
      }

      body {
        background: white;
      }

      .toolbar {
        display: none;
      }

      .print-container {
        padding: 0;
      }

      .sheet {
        box-shadow: none;
        page-break-after: avoid;
      }

      .sticker {
        border: none;
      }
    }
  `;

  render() {
    if (!this.layout) {
      return html`<div>No layout selected</div>`;
    }

    if (this.isGenerating) {
      return html`
        <div class="toolbar">
          <button @click=${this.goBack} class="secondary">Back</button>
        </div>
        <div class="loading">Generating QR codes...</div>
      `;
    }

    const pageSizeMm = `${this.layout.pageSizeWidth}mm ${this.layout.pageSizeHeight}mm`;
    const stickerWidthMm = `${this.layout.stickerWidth + this.layout.horizontalGap}mm`;
    const stickerHeightMm = `${this.layout.stickerHeight + this.layout.verticalGap}mm`;

    return html`
      <div class="toolbar">
        <button @click=${this.goBack} class="secondary">Back</button>
        <div class="layout-info">
          ${this.layout.name} - ${this.qrCodes.length} stickers
        </div>
        <button @click=${this.print}>Print</button>
      </div>

      <div class="print-container">
        <div
          class="sheet"
          style="
            width: ${pageSizeMm};
            padding: ${this.layout.topMargin}mm ${this.layout.leftMargin}mm;
          "
        >
          <div
            class="sticker-grid"
            style="
              grid-template-columns: repeat(${this.layout.colCount}, ${stickerWidthMm});
              grid-template-rows: repeat(${this.layout.rowCount}, ${stickerHeightMm});
              gap: ${this.layout.horizontalGap}mm ${this.layout.verticalGap}mm;
            "
          >
            ${this.qrCodes.map(
              (qr) => html`
                <div class="sticker">
                  <img src="${qr.dataUrl}" alt="QR: ${qr.id}" title="${qr.id}" />
                </div>
              `
            )}
          </div>
        </div>
      </div>
    `;
  }

  private print() {
    window.print();
  }

  private goBack() {
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: {
          screen: 'layout-browser',
          context: {},
        },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'qr-sheet-creator': QRSheetCreator;
  }
}
