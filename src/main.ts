import { Notice, Plugin, TFile } from 'obsidian';
import { isMindMapSource, openMindMap } from './commands/openMindMap';
import { registerViewCommands } from './commands/viewCommands';
import { VIEW_ICON, VIEW_TYPE_MIND_MAP } from './constants';
import { ElementIdOverlay } from './dev/elementIdOverlay';
import { recordFixtures } from './dev/recordFixtures';
import { setElementId } from './elementIds';
import { loadLanguage, t } from './i18n';
import { HOVER_SOURCE_ID } from './render/linkHandling';
import { LeafRecency } from './leafRecency';
import { type MindMapSettings, DEFAULT_SETTINGS, sanitizeSettings } from './settings';
import { MindMapSettingTab } from './settingsTab';
import { MindMapView } from './view/MindMapView';
import { parseViewState } from './view/viewState';

export default class MindMapperPlugin extends Plugin {
  /** Which leaf was active last: jump to source and link clicks go there. */
  readonly recency = new LeafRecency();
  override settings: MindMapSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    loadLanguage();
    this.settings = sanitizeSettings(await this.loadData());
    this.addSettingTab(new MindMapSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => this.recency.touch(leaf)),
    );
    this.registerView(
      VIEW_TYPE_MIND_MAP,
      (leaf) =>
        new MindMapView(leaf, {
          recency: this.recency,
          settings: () => this.settings,
          warnOnce: (id, message) => this.warnOnce(id, message),
        }),
    );
    this.registerHoverLinkSource(HOVER_SOURCE_ID, { display: 'Mind Mapper', defaultMod: true });

    this.addCommand({
      id: 'open-as-mind-map',
      name: t('openAsMindMap'),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isMindMapSource(file)) return false;
        if (!checking) this.open(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || !isMindMapSource(file)) return;
        menu.addItem((item) =>
          item
            .setTitle(t('openAsMindMap'))
            .setIcon(VIEW_ICON)
            .onClick(() => this.open(file)),
        );
      }),
    );

    const ribbonIcon = this.addRibbonIcon(VIEW_ICON, t('openAsMindMap'), () => {
      const file = this.app.workspace.getActiveFile();
      if (!isMindMapSource(file)) {
        new Notice(t('openNoteFirst'));
        return;
      }
      this.open(file);
    });
    setElementId(ribbonIcon, 'ribbon.open-mind-map');

    registerViewCommands(this);

    // A map tab restored but not shown yet has no loaded view to follow a rename itself.
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MIND_MAP)) {
          if (!leaf.isDeferred) continue;
          const state = parseViewState(leaf.getViewState().state);
          if (state.file !== oldPath) continue;
          // The layout and theme overrides stay with the map.
          leaf
            .setViewState({ type: VIEW_TYPE_MIND_MAP, state: { ...state, file: file.path } })
            .catch((error: unknown) => console.error('Mind Mapper: rename failed', error));
        }
      }),
    );

    if (__DEV__) {
      this.addCommand({
        id: 'record-parser-fixtures',
        name: 'Record parser fixtures (dev)',
        callback: () => {
          recordFixtures(this.app)
            .then((count) => new Notice(`Recorded ${count} parser fixtures`))
            .catch((error: unknown) => {
              console.error('Mind Mapper: failed to record fixtures', error);
              new Notice('Mind Mapper: recording fixtures failed, see console');
            });
        },
      });
      // Issue #33: labels every element with its ID (docs/ui-elements.md).
      const overlay = new ElementIdOverlay();
      this.register(() => overlay.hide());
      this.addCommand({
        id: 'show-element-ids',
        name: 'Show element IDs (dev)',
        callback: () => overlay.toggle(activeDocument),
      });
    }
  }

  private open(file: TFile): void {
    openMindMap(this.app.workspace, file).catch((error: unknown) => {
      console.error('Mind Mapper: failed to open mind map', error);
      new Notice(t('couldNotOpenMap'));
    });
  }

  private readonly warned = new Set<string>();

  /** Spec "Frontmatter": a notice once per note and invalid value, not on every save. */
  warnOnce(id: string, message: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    new Notice(message);
  }

  /** Validates, saves and applies to all open maps; a theme-only change skips the re-layout. */
  async updateSettings(patch: Partial<MindMapSettings>): Promise<void> {
    const previous = this.settings;
    this.settings = sanitizeSettings({ ...previous, ...patch });
    await this.saveData(this.settings);
    this.applySettings(previous);
  }

  /** `data.json` changed on disk (Sync, another window): reload and apply like a change here. */
  override async onExternalSettingsChange(): Promise<void> {
    const previous = this.settings;
    this.settings = sanitizeSettings(await this.loadData());
    this.applySettings(previous);
  }

  private applySettings(previous: MindMapSettings): void {
    const changed = (Object.keys(this.settings) as (keyof MindMapSettings)[]).filter(
      (key) => this.settings[key] !== previous[key],
    );
    // The theme is pure CSS; the fit zoom cap is only read by the next fit.
    const themeOnly = changed.length === 1 && changed[0] === 'defaultTheme';
    const fitCapOnly = changed.length === 1 && changed[0] === 'fitMaxZoom';
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MIND_MAP)) {
      if (!(leaf.view instanceof MindMapView)) continue;
      if (fitCapOnly) continue;
      if (themeOnly) leaf.view.applyTheme();
      else leaf.view.refresh();
    }
  }

  // Leaves are intentionally not detached here (Obsidian plugin guideline).
  override onunload(): void {}
}
