import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { StickerLayout } from '../models/layout.js';
import layouts from '../config/layouts.json' assert { type: 'json' };

@customElement('layout-browser')
export class LayoutBrowser extends LitElement {
  override createRenderRoot() {
    return this;
  }

  static styles = css`
    .layout-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      padding: 20px;
    }

    .layout-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .layout-card:hover {
      border-color: #007bff;
      box-shadow: 0 2px 8px rgba(0, 123, 255, 0.1);
    }

    .layout-card h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .layout-card p {
      margin: 4px 0;
      color: #666;
      font-size: 14px;
    }

    .layout-specs {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      margin: 12px 0;
      font-family: monospace;
      font-size: 12px;
    }

    button {
      background: #007bff;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 12px;
    }

    button:hover {
      background: #0056b3;
    }

    .title {
      text-align: center;
      padding: 20px;
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }

    .back-btn {
      position: absolute;
      top: 20px;
      left: 20px;
      background: #6c757d;
      padding: 8px 16px;
    }

    .back-btn:hover {
      background: #5a6268;
    }
  `;

  render() {
    return html`
      <button class="back-btn" @click=${this.goBack}>Back</button>
      <div class="title">Select Sticker Sheet Layout</div>
      <p class="help">Ensure that print margins and scaling are disabled for proper alignment</p>
      <div class="layout-grid">
        ${(layouts as StickerLayout[]).map(
          (layout) => html`
            <div class="layout-card">
              <h3>${layout.name}</h3>
              <p>${layout.description}</p>
              <div class="layout-specs">
                <div>Stickers: ${layout.rowCount} × ${layout.colCount}</div>
                <div>Sheet: ${layout.pageSizeWidth}×${layout.pageSizeHeight}mm</div>
                <div>Sticker: ${layout.stickerWidth}×${layout.stickerHeight}mm</div>
              </div>
              <button @click=${() => this.selectLayout(layout)}>
                Create Sheet
              </button>
            </div>
          `
        )}
      </div>
    `;
  }

  private selectLayout(layout: StickerLayout) {
    this.dispatchEvent(
      new CustomEvent('select-layout', {
        detail: layout,
        bubbles: true,
        composed: true,
      })
    );
  }

  private goBack() {
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: {
          screen: 'workspace-browser',
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
    'layout-browser': LayoutBrowser;
  }
}
