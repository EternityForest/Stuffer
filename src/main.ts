import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { initializeYDoc } from './services/storage.js';
import './components/app-shell.js';
import './components/workspace-selector.js';
import './components/workspace-browser.js';
import './components/object-inspect.js';
import './components/list-browser.js';
import './components/add-remove-item.js';
import './components/loadouts-manager.js';
import './components/workspace-settings.js';

@customElement('stuffer-app')
class StufferApp extends LitElement {

  async connectedCallback() {
    super.connectedCallback();
    await initializeYDoc();
  }

  render() {
    return html`
      <app-shell></app-shell>
    `;
  }
}

// Mount the app
const app = document.getElementById('app');
const stufferApp = document.createElement('stuffer-app');
app?.appendChild(stufferApp);
