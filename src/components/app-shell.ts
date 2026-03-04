import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

type Screen = 'workspace-selector' | 'workspace-browser' | 'object-inspect' | 'list-browser' | 'add-remove-item';

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

  constructor() {
    super();
    this.currentScreen = 'workspace-selector';
    this.currentWorkspace = null;
    this.selectedObject = null;
  }

  navigateTo(screen: Screen, context?: { workspace?: string; object?: string }) {
    this.currentScreen = screen;
    if (context?.workspace) this.currentWorkspace = context.workspace;
    if (context?.object) this.selectedObject = context.object;
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
          @navigate=${this.onNavigate}
        ></object-inspect>`;
      case 'list-browser':
        return html`<list-browser @navigate=${this.onNavigate}></list-browser>`;
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
