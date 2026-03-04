import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('list-browser')
export class ListBrowser extends LitElement {
  static createRenderRoot() {
    return this;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .header {
      padding: 1rem;
      border-bottom: 1px solid #ddd;
      display: flex;
      gap: 1rem;
    }

    button {
      padding: 0.5rem 1rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    button:hover {
      background-color: #0056b3;
    }

    .list-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }

    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }

    .item-info {
      flex: 1;
    }

    .delete-btn {
      background-color: #dc3545;
      padding: 0.5rem;
      width: auto;
    }

    .delete-btn:hover {
      background-color: #c82333;
    }
  `;

  @state()
  declare items: Array<{ id: string; name: string; amount: number }>;

  constructor() {
    super();
    this.items = [];
  }

  render() {
    return html`
      <div class="header">
        <button @click=${() => this.goBack()}>Back</button>
        <button @click=${() => this.addItem()}>Add Item</button>
      </div>
      <div class="list-container">
        ${this.items.map(item => html`
          <div class="list-item">
            <div class="item-info">
              <div>${item.name}</div>
              <div>Amount: ${item.amount}</div>
            </div>
            <button class="delete-btn" @click=${() => this.deleteItem(item.id)}>Delete</button>
          </div>
        `)}
        ${this.items.length === 0 ? html`<p>No items yet.</p>` : ''}
      </div>
    `;
  }

  private goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'object-inspect' },
      bubbles: true,
      composed: true,
    }));
  }

  private addItem() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'add-remove-item' },
      bubbles: true,
      composed: true,
    }));
  }

  private deleteItem(id: string) {
    this.items = this.items.filter(item => item.id !== id);
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'list-browser': ListBrowser;
  }
}
