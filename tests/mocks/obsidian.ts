/**
 * Minimal runtime stand-in for the `obsidian` module (types-only package).
 * Aliased in vitest.config.ts. Extend per milestone as code uses more API.
 */
import type { App, Command, PluginManifest, View, ViewStateResult, WorkspaceLeaf } from 'obsidian';

export class Component {
  load(): void {}
  onload(): void {}
  unload(): void {}
  onunload(): void {}
}

export class Plugin extends Component {
  readonly commands: Command[] = [];
  readonly viewFactories = new Map<string, (leaf: WorkspaceLeaf) => View>();

  constructor(
    public app: App,
    public manifest: PluginManifest,
  ) {
    super();
  }

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  registerView(type: string, factory: (leaf: WorkspaceLeaf) => View): void {
    this.viewFactories.set(type, factory);
  }
}

export class ItemView extends Component {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(public leaf: WorkspaceLeaf) {
    super();
    // Real leaves carry the app internally; test fakes expose it as `app`.
    this.app = (leaf as unknown as { app: App }).app;
    this.containerEl = document.createElement('div');
    this.containerEl.createDiv({ cls: 'view-header' });
    this.contentEl = this.containerEl.createDiv({ cls: 'view-content' });
  }

  getState(): Record<string, unknown> {
    return {};
  }

  setState(_state: unknown, _result: ViewStateResult): Promise<void> {
    return Promise.resolve();
  }
}

export class TFile {
  readonly basename: string;
  readonly extension: string;
  readonly name: string;

  constructor(public path: string) {
    this.name = path.split('/').pop() ?? path;
    const dot = this.name.lastIndexOf('.');
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1) : '';
  }
}

export class Notice {
  constructor(public message: string) {}
}
