import type {
  App,
  CachedMetadata,
  PluginManifest,
  TFile,
  ViewState,
  WorkspaceLeaf,
} from 'obsidian';
import { vi } from 'vitest';
import { loadFixture } from './fixtures';
import { TFile as MockTFile } from './mocks/obsidian';

export function fakeManifest(): PluginManifest {
  return {
    id: 'mind-mapper',
    name: 'Mind Mapper',
    version: '0.1.0',
    minAppVersion: '1.7.2',
    description: 'Renders a Markdown note as a mind map.',
    author: 'KingOfKalk',
    isDesktopOnly: true,
  };
}

export function fakeFile(path: string): TFile {
  return new MockTFile(path) as unknown as TFile;
}

/** Leaf stand-in. `view` is a plain object, like a deferred leaf whose real view is not loaded. */
export class FakeLeaf {
  view: unknown = {};
  /** Restored but not shown yet: the real view is not loaded (Obsidian 1.7.2+). */
  isDeferred = false;
  constructor(
    public app: App,
    public viewState: ViewState = { type: 'empty' },
  ) {}

  getViewState(): ViewState {
    return this.viewState;
  }

  setViewState = vi.fn((viewState: ViewState): Promise<void> => {
    this.viewState = viewState;
    return Promise.resolve();
  });

  asLeaf(): WorkspaceLeaf {
    return this as unknown as WorkspaceLeaf;
  }
}

export class FakeVault {
  readonly texts = new Map<string, string>();
  private readonly gates = new Map<string, Promise<void>>();
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(name: string, listener: (...args: unknown[]) => void): { off: () => void } {
    const set = this.listeners.get(name) ?? new Set();
    this.listeners.set(name, set);
    set.add(listener);
    return { off: () => set.delete(listener) };
  }

  offref(ref: { off: () => void }): void {
    ref.off();
  }

  /** `rename` (file, oldPath), `delete` (file), `create` (file). */
  trigger(name: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener(...args);
  }

  listenerCount(name: string): number {
    return this.listeners.get(name)?.size ?? 0;
  }

  getFileByPath(path: string): TFile | null {
    return this.texts.has(path) ? fakeFile(path) : null;
  }

  async cachedRead(file: TFile): Promise<string> {
    await this.gates.get(file.path);
    return this.texts.get(file.path) ?? '';
  }

  /** Makes `cachedRead` of `path` wait until the returned release function is called. */
  hold(path: string): () => void {
    let release = (): void => {};
    this.gates.set(
      path,
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    return () => release();
  }
}

type ChangedListener = (file: TFile, data: string, cache: CachedMetadata) => void;

export class FakeMetadataCache {
  readonly caches = new Map<string, CachedMetadata | null>();
  private readonly listeners = new Set<ChangedListener>();

  getFileCache(file: TFile): CachedMetadata | null {
    return this.caches.get(file.path) ?? null;
  }

  on(_name: 'changed', listener: ChangedListener): { off: () => void } {
    this.listeners.add(listener);
    return { off: () => this.listeners.delete(listener) };
  }

  offref(ref: { off: () => void }): void {
    ref.off();
  }

  /** Link path to a note in this fake vault (`name` or `name.md`). */
  getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
    const path = linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`;
    return this.caches.has(path) ? fakeFile(path) : null;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  trigger(path: string, text: string, cache: CachedMetadata): void {
    for (const listener of [...this.listeners]) listener(fakeFile(path), text, cache);
  }
}

export class FakeWorkspace {
  readonly vault = new FakeVault();
  readonly metadataCache = new FakeMetadataCache();
  app: App = {
    workspace: this,
    vault: this.vault,
    metadataCache: this.metadataCache,
  } as unknown as App;
  leaves: FakeLeaf[] = [];
  activeFile: TFile | null = null;
  activeView: unknown = null;

  /** Adds a note whose text and cache come from a recorded fixture. */
  addNote(path: string, fixtureName: string): void {
    const { text, cache } = loadFixture(fixtureName);
    this.vault.texts.set(path, text);
    this.metadataCache.caches.set(path, cache);
  }

  private readonly workspaceListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(name: string, listener: (...args: unknown[]) => void): { off: () => void } {
    const set = this.workspaceListeners.get(name) ?? new Set();
    this.workspaceListeners.set(name, set);
    set.add(listener);
    return { off: () => set.delete(listener) };
  }

  trigger(name: string, ...args: unknown[]): void {
    for (const listener of [...(this.workspaceListeners.get(name) ?? [])]) listener(...args);
  }

  offref(ref: { off: () => void }): void {
    ref.off();
  }

  getActiveViewOfType<T>(type: abstract new (...args: never[]) => T): T | null {
    return this.activeView instanceof type ? this.activeView : null;
  }

  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.viewState.type === type).map((l) => l.asLeaf());
  }

  addLeaf(viewState: ViewState): FakeLeaf {
    const leaf = new FakeLeaf(this.app, viewState);
    this.leaves.push(leaf);
    return leaf;
  }

  getLeaf = vi.fn((..._args: unknown[]): WorkspaceLeaf => this.addLeaf({ type: 'empty' }).asLeaf());
  revealLeaf = vi.fn((_leaf: WorkspaceLeaf): Promise<void> => Promise.resolve());
  detachLeavesOfType = vi.fn();
}

export function fakeApp(workspace = new FakeWorkspace()): App {
  return workspace.app;
}
