import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { initializeYDoc, getWorkspacesMap, findItemById } from './services/storage.js';
import { registerAssetIdProtocolHandler, parseAssetIdURL, resolveAssetIdURL, registerWorkspaceSearcher } from './services/url-handler.js';
import './components/app-shell.js';
import './components/workspace-selector.js';
import './components/workspace-browser.js';
import './components/object-inspect.js';
import './components/list-browser.js';
import './components/add-remove-item.js';
import './components/loadouts-manager.js';
import './components/workspace-settings.js';
import './components/layout-browser.js';
import './components/qr-sheet-creator.js';

import './styles/barrel.css';
import './styles/basic.css';

@customElement('stuffer-app')
class StufferApp extends LitElement {

  async connectedCallback() {
    super.connectedCallback();
    await initializeYDoc();
  }

  override createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <app-shell></app-shell>
    `;
  }
}

// Mount the app
async function initApp() {
  await initializeYDoc();
  registerAssetIdProtocolHandler();

  // Register workspace searcher for asset ID resolution
  registerWorkspaceSearcher({
    async findAssetInWorkspaces(assetId: string) {
      try {
        const workspacesMap = await getWorkspacesMap();

        // Search each workspace for the asset
        for (const [workspaceKey] of workspacesMap) {
          const item = await findItemById(workspaceKey, assetId);
          if (item) {
            return { workspaceKey, objectId: assetId };
          }
        }
      } catch (error) {
        console.error('Error searching workspaces for asset:', error);
      }
      return null;
    },
  });

  const app = document.getElementById('app');
  const stufferApp = document.createElement('stuffer-app');
  app?.appendChild(stufferApp);

  // Handle startup URL if present
  setTimeout(async () => {
    const appShell = stufferApp.querySelector('app-shell') as any;
    if (appShell && window.location.search.includes('asset-id=')) {
      const params = new URLSearchParams(window.location.search);
      const assetIdParam = params.get('asset-id');
      if (assetIdParam) {
        const assetId = parseAssetIdURL(assetIdParam);
        if (assetId) {
          const urlNav = await resolveAssetIdURL(assetId);
          if (urlNav) {
            appShell.navigateTo(urlNav.screen, urlNav.context);
          }
        }
      }
    }
  }, 100);
}

initApp();
