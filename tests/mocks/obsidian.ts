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

/** What `getLanguage` returns; tests set it, `tests/setup.ts` resets it to English. */
export const language = { code: 'en' };

export function getLanguage(): string {
  return language.code;
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
  readonly settingTabs: PluginSettingTab[] = [];
  /** What `loadData` returns; `saveData` stores here. */
  data: unknown = null;

  loadData(): Promise<unknown> {
    return Promise.resolve(this.data);
  }

  saveData(data: unknown): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  readonly ribbonIcons: {
    icon: string;
    title: string;
    callback: (evt: MouseEvent) => unknown;
    el: HTMLElement;
  }[] = [];

  addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
    const el = document.createElement('div');
    this.ribbonIcons.push({ icon, title, callback, el });
    return el;
  }

  registerHoverLinkSource(id: string, info: { display: string; defaultMod: boolean }): void {
    this.hoverSources.set(id, info);
  }
}

export class ItemView extends Component {
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  scope: Scope | null = null;

  constructor(public leaf: WorkspaceLeaf) {
    super();
    // Real leaves carry the app internally; test fakes expose it as `app`.
    this.app = (leaf as unknown as { app: App }).app;
    this.containerEl = document.createElement('div');
    // Real views fill the header title once, on load, and never refresh it by themselves.
    this.containerEl.createDiv({ cls: 'view-header' }).createDiv({ cls: 'view-header-title' });
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
  /** Every notice shown, in order (tests reset it). */
  static messages: string[] = [];
  constructor(public message: string) {
    Notice.messages.push(message);
  }
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
  /** Like Obsidian: Ctrl/Cmd click and middle click mean "new tab". */
  static isModEvent(evt?: MouseEvent | KeyboardEvent | null): string | boolean {
    if (evt instanceof MouseEvent && evt.button === 1) return 'tab';
    return evt?.ctrlKey || evt?.metaKey ? 'tab' : false;
  }
}

/** The parts of Obsidian's `SettingDefinition` the mock renders. */
export interface MockSettingDefinition {
  name: string;
  desc?: string | DocumentFragment;
  render?: (setting: Setting, group: unknown) => unknown;
  action?: (el: HTMLElement, index: number) => void;
  control?: {
    type: string;
    key: string;
    options?: Record<string, string>;
    defaultValue?: unknown;
    min?: number;
    max?: number;
    step?: number;
    displayFormat?: (value: number) => string;
  };
}

/** The parts of Obsidian's `SettingDefinitionGroup` the mock renders. */
export interface MockSettingGroup {
  type: 'group';
  heading?: string;
  items?: MockSettingDefinition[];
}

export type MockSettingItem = MockSettingDefinition | MockSettingGroup;

export class PluginSettingTab {
  containerEl: HTMLElement = document.createElement('div');
  constructor(
    public app: App,
    public plugin: Plugin,
  ) {}
  getSettingDefinitions(): MockSettingItem[] {
    return [];
  }
  /** Like Obsidian: reads `plugin.settings`. */
  getControlValue(key: string): unknown {
    return (this.plugin as unknown as { settings?: Record<string, unknown> }).settings?.[key];
  }
  /** Like Obsidian: mutates `plugin.settings` and saves it. */
  setControlValue(key: string, value: unknown): void | Promise<void> {
    const settings = (this.plugin as unknown as { settings?: Record<string, unknown> }).settings;
    if (!settings) return;
    settings[key] = value;
    return this.plugin.saveData(settings);
  }
}

/**
 * Renders a tab's definitions like Obsidian's settings modal (1.15.0): groups under their heading,
 * a row per definition with its name and description, then `action`, `render(setting)` or the
 * control bound through `getControlValue` / `setControlValue`. Only dropdown, toggle and slider
 * controls are implemented.
 */
export function renderSettingDefinitions(tab: PluginSettingTab): void {
  for (const item of tab.getSettingDefinitions()) {
    if ('type' in item) {
      if (item.type !== 'group') throw new Error(`mock does not render ${String(item.type)}`);
      for (const def of item.items ?? []) renderDefinition(tab, def, item.heading ?? null);
    } else {
      renderDefinition(tab, item, null);
    }
  }
}

function renderDefinition(
  tab: PluginSettingTab,
  def: MockSettingDefinition,
  group: string | null,
): void {
  const setting = new Setting(tab.containerEl).setName(def.name).setDesc(def.desc ?? '');
  setting.group = group;
  if (def.action) {
    const action = def.action;
    setting.action = () => action(setting.settingEl, 0);
  } else if (def.render) {
    def.render(setting, null);
  } else if (def.control) {
    renderControl(tab, setting, def.control);
  }
}

function renderControl(
  tab: PluginSettingTab,
  setting: Setting,
  control: NonNullable<MockSettingDefinition['control']>,
): void {
  const { type, key, options = {}, defaultValue } = control;
  const value = tab.getControlValue(key) ?? defaultValue;
  if (type === 'toggle') {
    setting.addToggle((toggle) =>
      toggle.setValue(value === true).onChange((next) => tab.setControlValue(key, next)),
    );
  } else if (type === 'dropdown') {
    setting.addDropdown((dropdown) => {
      for (const [option, display] of Object.entries(options)) dropdown.addOption(option, display);
      dropdown.setValue(String(value)).onChange((next) => tab.setControlValue(key, next));
    });
  } else if (type === 'slider') {
    let slider: SliderComponent | null = null;
    // Like Obsidian: a default value adds a "Restore default" button.
    if (defaultValue !== undefined) {
      setting.addExtraButton((button) =>
        button.setIcon('lucide-rotate-ccw').onClick(() => slider?.setValue(defaultValue as number)),
      );
    }
    setting.addSlider((component) => {
      slider = component;
      if (control.displayFormat) component.setDisplayFormat(control.displayFormat);
      component
        .setLimits(control.min ?? 0, control.max ?? 100, control.step ?? 1)
        .setValue(value as number)
        .onChange((next) => tab.setControlValue(key, next));
    });
  } else {
    throw new Error(`mock does not render ${type} controls`);
  }
}

type ChangeHandler = (value: string) => unknown;

/**
 * Like Obsidian's `BaseComponent`: `then(cb)` calls `cb(this)` and returns `this`, so every
 * component is a thenable. A promise resolved with a component (e.g. returned from a `.then`
 * callback) calls `then` again with its own resolve function, forever: an endless microtask
 * loop that freezes Obsidian. The mock throws instead, so such a test fails rather than hangs.
 */
class BaseComponent {
  thenCalls = 0;
  then(cb: (component: this) => unknown): this {
    if (++this.thenCalls > 100)
      throw new Error('component used as a thenable: endless promise resolution');
    cb(this);
    return this;
  }
}

export class DropdownComponent extends BaseComponent {
  readonly options = new Map<string, string>();
  value = '';
  changeHandler: ChangeHandler | null = null;
  addOption(value: string, display: string): this {
    this.options.set(value, display);
    return this;
  }
  setValue(value: string): this {
    this.value = value;
    return this;
  }
  onChange(handler: ChangeHandler): this {
    this.changeHandler = handler;
    return this;
  }
}

export class ToggleComponent extends BaseComponent {
  value = false;
  changeHandler: ((value: boolean) => unknown) | null = null;
  setValue(value: boolean): this {
    this.value = value;
    return this;
  }
  onChange(handler: (value: boolean) => unknown): this {
    this.changeHandler = handler;
    return this;
  }
}

export class TextComponent extends BaseComponent {
  inputEl: HTMLInputElement = document.createElement('input');
  value = '';
  changeHandler: ChangeHandler | null = null;
  setPlaceholder(_placeholder: string): this {
    return this;
  }
  setValue(value: string): this {
    this.value = value;
    return this;
  }
  onChange(handler: ChangeHandler): this {
    this.changeHandler = handler;
    return this;
  }
}

/** Like Obsidian's slider: `setValue` with a new value calls the change handler. */
export class SliderComponent extends BaseComponent {
  min = 0;
  max = 100;
  step = 1;
  value = 50;
  displayFormat: ((value: number) => string) | null = null;
  changeHandler: ((value: number) => unknown) | null = null;
  setLimits(min: number, max: number, step: number): this {
    this.min = min;
    this.max = max;
    this.step = step;
    return this;
  }
  setDisplayFormat(format: (value: number) => string): this {
    this.displayFormat = format;
    return this;
  }
  setValue(value: number): this {
    if (value !== this.value) {
      this.value = value;
      void this.changeHandler?.(value);
    }
    return this;
  }
  /** The value shown next to the slider. */
  getValuePretty(): string {
    return this.displayFormat ? this.displayFormat(this.value) : String(this.value);
  }
  onChange(handler: (value: number) => unknown): this {
    this.changeHandler = handler;
    return this;
  }
}

export class ExtraButtonComponent extends BaseComponent {
  icon = '';
  clickHandler: (() => unknown) | null = null;
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  setTooltip(_tooltip: string): this {
    return this;
  }
  onClick(handler: () => unknown): this {
    this.clickHandler = handler;
    return this;
  }
}

/** Records every created setting row, so tests can find a row by name and drive its control. */
export class Setting {
  static rows: Setting[] = [];
  name = '';
  desc = '';
  dropdown: DropdownComponent | null = null;
  toggle: ToggleComponent | null = null;
  text: TextComponent | null = null;
  slider: SliderComponent | null = null;
  readonly extraButtons: ExtraButtonComponent[] = [];
  /** A fragment description as rendered (`desc` holds its text, which search indexes). */
  descEl: DocumentFragment | null = null;
  /** Heading of the group the row is in. */
  group: string | null = null;
  /** Row click of an `action` definition. */
  action: (() => void) | null = null;
  readonly settingEl: HTMLElement = document.createElement('div');

  constructor(public containerEl: HTMLElement) {
    Setting.rows.push(this);
  }
  setName(name: string): this {
    this.name = name;
    return this;
  }
  setDesc(desc: string | DocumentFragment): this {
    this.desc = typeof desc === 'string' ? desc : (desc.textContent ?? '');
    this.descEl = typeof desc === 'string' ? null : desc;
    return this;
  }
  setHeading(): this {
    return this;
  }
  addDropdown(cb: (dropdown: DropdownComponent) => unknown): this {
    this.dropdown = new DropdownComponent();
    cb(this.dropdown);
    return this;
  }
  addToggle(cb: (toggle: ToggleComponent) => unknown): this {
    this.toggle = new ToggleComponent();
    cb(this.toggle);
    return this;
  }
  addText(cb: (text: TextComponent) => unknown): this {
    this.text = new TextComponent();
    cb(this.text);
    return this;
  }
  addSlider(cb: (slider: SliderComponent) => unknown): this {
    this.slider = new SliderComponent();
    cb(this.slider);
    return this;
  }
  addExtraButton(cb: (button: ExtraButtonComponent) => unknown): this {
    const button = new ExtraButtonComponent();
    this.extraButtons.push(button);
    cb(button);
    return this;
  }
}

export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const hash = linktext.indexOf('#');
  return hash < 0
    ? { path: linktext, subpath: '' }
    : { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}

interface MockCache {
  headings?: { heading: string; position: { start: { line: number } } }[];
  blocks?: Record<string, unknown>;
}

/**
 * Approximation of Obsidian's resolver: `#^id` looks up the block, `#A#B` matches heading texts
 * exactly and in order (B after A). The real one is covered by E2E.
 */
export function resolveSubpath(cache: MockCache, subpath: string): unknown {
  if (subpath.startsWith('#^')) {
    const block = cache.blocks?.[subpath.slice(2)];
    return block ? { type: 'block', block } : null;
  }
  const parts = subpath.slice(1).split('#');
  const headings = cache.headings ?? [];
  let index = -1;
  for (const part of parts) {
    index = headings.findIndex((h, i) => i > index && h.heading === part);
    if (index < 0) return null;
  }
  return { type: 'heading', current: headings[index], next: headings[index + 1] };
}

export interface MockKeyHandler {
  modifiers: string[] | null;
  key: string | null;
  func: (evt: KeyboardEvent) => unknown;
}

/** Records key handlers; tests call `handlers[i].func` to simulate the key. */
export class Scope {
  handlers: MockKeyHandler[] = [];
  constructor(public parent?: Scope) {}
  register(
    modifiers: string[] | null,
    key: string | null,
    func: (evt: KeyboardEvent) => unknown,
  ): MockKeyHandler {
    const handler = { modifiers, key, func };
    this.handlers.push(handler);
    return handler;
  }
  unregister(handler: MockKeyHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }
}

export class MenuItem {
  title = '';
  icon = '';
  checked: boolean | null = null;
  clickHandler: (() => unknown) | null = null;
  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  setChecked(checked: boolean | null): this {
    this.checked = checked;
    return this;
  }
  onClick(handler: () => unknown): this {
    this.clickHandler = handler;
    return this;
  }
}

export interface MockMenuPosition {
  x: number;
  y: number;
  width?: number;
  overlap?: boolean;
  left?: boolean;
}

export class Menu {
  /** The last menu shown; tests reset it. */
  static lastShown: Menu | null = null;
  readonly items: MenuItem[] = [];
  /** Items and separators in order. */
  readonly entries: (MenuItem | 'separator')[] = [];
  shownAt: { position: MockMenuPosition; doc: Document | undefined } | null = null;
  addItem(cb: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    this.items.push(item);
    this.entries.push(item);
    cb(item);
    return this;
  }
  addSeparator(): this {
    this.entries.push('separator');
    return this;
  }
  showAtPosition(position: MockMenuPosition, doc?: Document): this {
    this.shownAt = { position, doc };
    Menu.lastShown = this;
    return this;
  }
}
