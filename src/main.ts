import { Notice, Plugin } from 'obsidian';
import { isMindMapSource, openMindMap } from './commands/openMindMap';
import { registerViewCommands } from './commands/viewCommands';
import { VIEW_TYPE_MIND_MAP } from './constants';
import { recordFixtures } from './dev/recordFixtures';
import { HOVER_SOURCE_ID } from './render/linkHandling';
import { LeafRecency } from './view/leafRecency';
import { MindMapView } from './view/MindMapView';
import { parseViewState } from './view/viewState';

export default class MindMapperPlugin extends Plugin {
  /** Which leaf was active last: jump to source and link clicks go there. */
  readonly recency = new LeafRecency();

  override async onload(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => this.recency.touch(leaf)),
    );
    this.registerView(VIEW_TYPE_MIND_MAP, (leaf) => new MindMapView(leaf, this.recency));
    this.registerHoverLinkSource(HOVER_SOURCE_ID, { display: 'Mind Mapper', defaultMod: true });

    this.addCommand({
      id: 'open-as-mind-map',
      name: 'Open as mind map',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isMindMapSource(file)) return false;
        if (!checking) {
          openMindMap(this.app.workspace, file).catch((error: unknown) => {
            console.error('Mind Mapper: failed to open mind map', error);
          });
        }
        return true;
      },
    });

    registerViewCommands(this);

    // A map tab restored but not shown yet has no loaded view to follow a rename itself.
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MIND_MAP)) {
          if (!leaf.isDeferred) continue;
          if (parseViewState(leaf.getViewState().state).file !== oldPath) continue;
          leaf
            .setViewState({ type: VIEW_TYPE_MIND_MAP, state: { file: file.path } })
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
    }
  }

  // Leaves are intentionally not detached here (Obsidian plugin guideline).
  override onunload(): void {}
}
