import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('object-inspect')
export class ObjectInspect extends LitElement {
  static createRenderRoot() {
    return this;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
    }

    .header {
      padding: 1rem;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
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

    .content {
      padding: 1.5rem;
      flex: 1;
    }

    .property {
      margin-bottom: 1.5rem;
    }

    .property label {
      display: block;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }

    .property input,
    .property textarea {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-family: inherit;
    }

    .property textarea {
      resize: vertical;
      min-height: 100px;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .actions button {
      width: 100%;
    }

    h2 {
      margin-top: 0;
    }
  `;

  @property()
  declare objectId: string;

  render() {
    return html`
      <div class="header">
        <h2>Object Details</h2>
        <button @click=${() => this.goBack()}>Back</button>
      </div>
      <div class="content">
        <div class="property">
          <label>Title</label>
          <input type="text" placeholder="Object title" />
        </div>
        <div class="property">
          <label>Description</label>
          <textarea placeholder="Object notes and description"></textarea>
        </div>
        <div class="property">
          <label>Image</label>
          <input type="file" accept="image/*" />
        </div>
        <div class="property">
          <label>Loadout</label>
          <select>
            <option>None</option>
          </select>
        </div>
        <div class="actions">
          <button @click=${() => this.addContents()}>Add Contents</button>
          <button @click=${() => this.removeContents()}>Remove Contents</button>
          <button @click=${() => this.saveAsLoadout()}>Save as Loadout</button>
          <button @click=${() => this.recheckInventory()}>Recheck Inventory</button>
        </div>
      </div>
    `;
  }

  private goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'workspace-browser' },
      bubbles: true,
      composed: true,
    }));
  }

  private addContents() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'add-remove-item' },
      bubbles: true,
      composed: true,
    }));
  }

  private removeContents() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { screen: 'list-browser' },
      bubbles: true,
      composed: true,
    }));
  }

  private saveAsLoadout() {
    alert('Save as loadout functionality');
  }

  private recheckInventory() {
    alert('Recheck inventory functionality');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'object-inspect': ObjectInspect;
  }
}
