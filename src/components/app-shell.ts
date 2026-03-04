import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

type Screen = 'workspace-selector' | 'workspace-browser' | 'object-inspect' | 'list-browser' | 'add-remove-item' | 'loadouts-manager';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
  `;

  static createRenderRoot() {
    return this;
  }

  @state()
  declare currentScreen: Screen;

  @state()
  declare currentWorkspace: string | null;

  @state()
  declare selectedObject: string | null;

  @state()
  declare navigateContext: any;

  constructor() {
    super();
    this.currentScreen = 'workspace-selector';
    this.currentWorkspace = null;
    this.selectedObject = null;
    this.navigateContext = null;
  }

  navigateTo(screen: Screen, context?: { workspace?: string; workspaceKey?: string; object?: string; containerId?: string; loadoutId?: string; mode?: string }) {
    this.currentScreen = screen;
    if (context?.workspace) this.currentWorkspace = context.workspace;
    if (context?.workspaceKey) this.currentWorkspace = context.workspaceKey;
    if (context?.object) this.selectedObject = context.object;
    this.navigateContext = context || null;
  }

  render() {
    return html`
      <div class="container">
        ${this.renderScreen()}
      </div>
    `;
  }

  private renderScreen() {
    switch (this.currentScreen) {
      case 'workspace-selector':
        return html`<workspace-selector @select-workspace=${this.onSelectWorkspace}></workspace-selector>`;
      case 'workspace-browser':
        return html`<workspace-browser
          .workspaceName=${this.currentWorkspace}
          .workspaceKey=${this.currentWorkspace}
          @select-object=${this.onSelectObject}
          @navigate=${this.onNavigate}
        ></workspace-browser>`;
      case 'object-inspect':
        return html`<object-inspect
          .objectId=${this.selectedObject}
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></object-inspect>`;
      case 'list-browser':
        return html`<list-browser
          .workspaceKey=${this.currentWorkspace}
          .containerId=${(this.navigateContext?.containerId as string) || ''}
          .loadoutId=${(this.navigateContext?.loadoutId as string) || ''}
          .mode=${(this.navigateContext?.mode as 'add-to-contents' | 'remove-from-contents' | 'create-loadout' | 'edit-loadout') || 'create-loadout'}
          @navigate=${this.onNavigate}
        ></list-browser>`;
      case 'loadouts-manager':
        return html`<loadouts-manager
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></loadouts-manager>`;
      case 'add-remove-item':
        return html`<add-remove-item
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></add-remove-item>`;
      default:
        return html`<div>Unknown screen</div>`;
    }
  }

  private onSelectWorkspace = (e: CustomEvent<string>) => {
    this.navigateTo('workspace-browser', { workspace: e.detail });
  };

  private onSelectObject = (e: CustomEvent<string>) => {
    this.navigateTo('object-inspect', { object: e.detail });
  };

  private onNavigate = (e: CustomEvent<{ screen: Screen; context?: any }>) => {
    this.navigateTo(e.detail.screen, e.detail.context);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
