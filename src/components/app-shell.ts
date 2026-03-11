import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

const appStyles = css`
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    gap: 20px;
  }

  .container {
    padding: 20px;
  }
`;

type Screen =
  | "workspace-selector"
  | "workspace-browser"
  | "object-inspect"
  | "list-browser"
  | "add-remove-item"
  | "loadouts-manager"
  | "workspace-settings"
  | "layout-browser"
  | "qr-sheet-creator"
  | "qr-scanner";

@customElement("app-shell")
export class AppShell extends LitElement {
  override createRenderRoot() {
    return this;
  }

  static styles = appStyles;

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
    this.currentScreen = "workspace-selector";
    this.currentWorkspace = null;
    this.selectedObject = null;
    this.navigateContext = null;
  }

  navigateTo(
    screen: Screen,
    context?: {
      workspace?: string;
      workspaceKey?: string;
      object?: string;
      containerId?: string;
      loadoutId?: string;
      mode?: string;
      layout?: any;
    }
  ) {
    this.currentScreen = screen;
    if (context?.workspace) this.currentWorkspace = context.workspace;
    if (context?.workspaceKey) this.currentWorkspace = context.workspaceKey;
    if (context?.object) this.selectedObject = context.object;
    this.navigateContext = context || null;
  }

  render() {
    return html` <div class="container">${this.renderScreen()}</div> `;
  }

  private renderScreen() {
    switch (this.currentScreen) {
      case "workspace-selector":
        return html`<workspace-selector
          @select-workspace=${this.onSelectWorkspace}
        ></workspace-selector>`;
      case "workspace-browser":
        return html`<workspace-browser
          .workspaceName=${this.currentWorkspace}
          .workspaceKey=${this.currentWorkspace}
          @select-object=${this.onSelectObject}
          @navigate=${this.onNavigate}
        ></workspace-browser>`;
      case "object-inspect":
        return html`<object-inspect
          .objectId=${this.selectedObject}
          .workspaceKey=${this.currentWorkspace}
          @select-object=${this.onSelectObject}
          @navigate=${this.onNavigate}
        ></object-inspect>`;
      case "list-browser":
        return html`<list-browser
          .workspaceKey=${this.currentWorkspace}
          .containerId=${(this.navigateContext?.containerId as string) || ""}
          .loadoutId=${(this.navigateContext?.loadoutId as string) || ""}
          .mode=${(this.navigateContext?.mode as
            | "add-to-contents"
            | "remove-from-contents"
            | "create-loadout"
            | "edit-loadout") || "create-loadout"}
          @navigate=${this.onNavigate}
        ></list-browser>`;
      case "loadouts-manager":
        return html`<loadouts-manager
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></loadouts-manager>`;
      case "workspace-settings":
        return html`<workspace-settings
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></workspace-settings>`;
      case "add-remove-item":
        return html`<add-remove-item
          .workspaceKey=${this.currentWorkspace}
          @navigate=${this.onNavigate}
        ></add-remove-item>`;
      case "layout-browser":
        return html`<layout-browser
          @select-layout=${this.onSelectLayout}
          @navigate=${this.onNavigate}
        ></layout-browser>`;
      case "qr-sheet-creator":
        return html`<qr-sheet-creator
          @navigate=${this.onNavigate}
        ></qr-sheet-creator>`;
      case "qr-scanner":
        return html`<qr-scanner
          .workspaceKey=${this.currentWorkspace}
          @select-object=${this.onSelectObject}
          @navigate=${this.onNavigate}
        ></qr-scanner>`;
      default:
        return html`<div>Unknown screen</div>`;
    }
  }

  private onSelectWorkspace = (e: CustomEvent<string>) => {
    this.navigateTo("workspace-browser", { workspace: e.detail });
  };

  private onSelectObject = (e: CustomEvent<string>) => {
    this.navigateTo("object-inspect", { object: e.detail });
  };

  private onNavigate = (e: CustomEvent<{ screen: Screen; context?: any }>) => {
    this.navigateTo(e.detail.screen, e.detail.context);
  };

  private onSelectLayout = (e: CustomEvent<any>) => {
    this.navigateTo("qr-sheet-creator", { layout: e.detail });

    setTimeout(() => {
      const qrSheet = this.querySelector("qr-sheet-creator") as any;
      if (qrSheet) {
        qrSheet.setLayout(e.detail);
      }
    }, 300);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "app-shell": AppShell;
  }
}
