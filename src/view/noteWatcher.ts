import type { App, CachedMetadata, EventRef, TAbstractFile, TFile } from 'obsidian';

/** Spec "Live update": debounced about 300 ms. */
export const LIVE_UPDATE_DEBOUNCE_MS = 300;

/** What the watcher needs from its view, and what it reports. */
export interface NoteWatcherHost {
  /** The view's own window (timers): popout safe. */
  win(): Window;
  /** Path of the note the view shows; null: none. */
  path(): string | null;
  /** A map is shown: changes are debounced (else the first one renders at once). */
  hasMap(): boolean;
  /** Registers an event with the view, so it is removed when the view unloads. */
  register(ref: EventRef): void;
  /** The note changed; the text matches its cache, no separate read. */
  changed(file: TFile, data: string, cache: CachedMetadata): void;
  /** The note was renamed or moved (`file` is at its new path). */
  renamed(file: TAbstractFile, oldPath: string): void;
  deleted(): void;
  /** A note was created at the path of the deleted one. */
  recreated(): void;
}

/**
 * Spec "Live update" and "View state": the metadata cache and vault events of the shown note
 * (changes, debounced; rename, delete, a note created in its place).
 */
export class NoteWatcher {
  /** The one `changed` listener (live update, and the first render of a not yet indexed note). */
  private changeRef: EventRef | null = null;
  /** Vault rename / delete / create listeners. */
  private vaultRefs: EventRef[] = [];
  /** The note was deleted; a note created at its path is shown again. */
  private deleted = false;
  private updateTimer: number | null = null;

  constructor(
    private readonly app: App,
    private readonly host: NoteWatcherHost,
  ) {}

  /** A note loads: it is not deleted, a pending update is dropped; listens from now on. */
  watch(): void {
    this.deleted = false;
    this.cancelUpdate();
    if (this.changeRef) return;
    this.listenToVault();
    this.changeRef = this.app.metadataCache.on('changed', (file, data, cache) => {
      if (file.path !== this.host.path()) return;
      // Nothing shown yet (loading): render at once.
      if (!this.host.hasMap()) return this.host.changed(file, data, cache);
      this.cancelUpdate();
      this.updateTimer = this.host.win().setTimeout(() => {
        this.updateTimer = null;
        this.host.changed(file, data, cache);
      }, LIVE_UPDATE_DEBOUNCE_MS);
    });
    this.host.register(this.changeRef);
  }

  /** Stops listening and drops a pending update (view closed). */
  stop(): void {
    for (const ref of this.vaultRefs) this.app.vault.offref(ref);
    this.vaultRefs = [];
    if (this.changeRef) {
      this.app.metadataCache.offref(this.changeRef);
      this.changeRef = null;
    }
    this.cancelUpdate();
  }

  /** Drops a debounced change not applied yet. */
  cancelUpdate(): void {
    if (this.updateTimer === null) return;
    this.host.win().clearTimeout(this.updateTimer);
    this.updateTimer = null;
  }

  private listenToVault(): void {
    const { vault } = this.app;
    this.vaultRefs = [
      vault.on('rename', (file, oldPath) => {
        if (oldPath === this.host.path()) this.host.renamed(file, oldPath);
      }),
      vault.on('delete', (file) => {
        if (file.path !== this.host.path()) return;
        this.deleted = true;
        this.cancelUpdate();
        this.host.deleted();
      }),
      vault.on('create', (file) => {
        if (!this.deleted || file.path !== this.host.path()) return;
        this.host.recreated();
      }),
    ];
    for (const ref of this.vaultRefs) this.host.register(ref);
  }
}
