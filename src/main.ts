import { Plugin } from 'obsidian';
import { isMindMapSource, openMindMap } from './commands/openMindMap';
import { VIEW_TYPE_MIND_MAP } from './constants';
import { MindMapView } from './view/MindMapView';

export default class MindMapperPlugin extends Plugin {
  override async onload(): Promise<void> {
    this.registerView(VIEW_TYPE_MIND_MAP, (leaf) => new MindMapView(leaf));

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
  }

  // Leaves are intentionally not detached here (Obsidian plugin guideline).
  override onunload(): void {}
}
