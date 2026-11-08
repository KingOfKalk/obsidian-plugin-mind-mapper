/**
 * Minimal runtime stand-in for the `obsidian` module (types-only package).
 * Aliased in vitest.config.ts. Extend per milestone as code uses more API.
 */
import type { App, Command, PluginManifest, View, ViewStateResult, WorkspaceLeaf } from 'obsidian';

export const apiVersion = '1.7.2-test';

export class Component {
  private cleanups: (() => void)[] = [];
  private readonly children = new Set<Component>();
  /** Test helper: true between load() and unload(). */
  loaded = false;

  load(): void {
    this.loaded = true;
    this.onload();
  }
  onload(): void {}

  unload(): void {
    for (const child of [...this.children]) this.removeChild(child);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.loaded = false;
    this.onunload();
  }
  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this.children.add(child);
    child.load();
    return child;
  }

  removeChild<T extends Component>(child: T): T {
    if (this.children.delete(child)) child.unload();
    return child;
  }

  register(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  registerEvent(ref: unknown): void {
    // Test fakes return refs with `off()`; real EventRefs are opaque.
    this.register(() => (ref as { off?: () => void }).off?.());
  }

  registerDomEvent(
    el: EventTarget,
    type: string,
    callback: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
    this.register(() => el.removeEventListener(type, callback, options));
  }
}

export function setIcon(el: HTMLElement, icon: string): void {
  el.dataset.icon = icon;
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

  readonly hoverSources = new Map<string, { display: string; defaultMod: boolean }>();

  registerHoverLinkSource(id: string, info: { display: string; defaultMod: boolean }): void {
    this.hoverSources.set(id, info);
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

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  onResize(): void {}
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

/** Default: renders the markdown as plain text. Tests replace `render` via vi.spyOn. */
export class MarkdownRenderer {
  static render(
    _app: App,
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: Component,
  ): Promise<void> {
    el.createDiv({ text: markdown });
    return Promise.resolve();
  }
}

export class Modal {
  readonly containerEl: HTMLElement;
  readonly modalEl: HTMLElement;
  readonly contentEl: HTMLElement;
  readonly titleEl: HTMLElement;
  /** Test helper: the most recently opened modal. */
  static lastOpened: Modal | null = null;

  constructor(public app: App) {
    this.containerEl = document.createElement('div');
    this.modalEl = this.containerEl.createDiv({ cls: 'modal' });
    this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' });
    this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
  }

  open(): void {
    Modal.lastOpened = this;
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {}
  onClose(): void {}
}

export class Keymap {
  /** Like Obsidian: Ctrl/Cmd click means "new tab". */
  static isModEvent(evt?: MouseEvent | KeyboardEvent | null): string | boolean {
    return evt?.ctrlKey || evt?.metaKey ? 'tab' : false;
  }
}
