import type { App, PluginManifest, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import { vi } from 'vitest';
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

export class FakeWorkspace {
  app: App = { workspace: this } as unknown as App;
  leaves: FakeLeaf[] = [];
  activeFile: TFile | null = null;

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
