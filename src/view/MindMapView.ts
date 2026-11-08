import { ItemView, type ViewStateResult } from 'obsidian';
import { VIEW_ICON, VIEW_TYPE_MIND_MAP } from '../constants';
import { fileBasename, parseViewState } from './viewState';

export class MindMapView extends ItemView {
  private pinnedFile: string | null = null;

  get file(): string | null {
    return this.pinnedFile;
  }

  getViewType(): string {
    return VIEW_TYPE_MIND_MAP;
  }

  override getIcon(): string {
    return VIEW_ICON;
  }

  getDisplayText(): string {
    return this.pinnedFile === null ? 'Mind map' : fileBasename(this.pinnedFile);
  }

  override async onOpen(): Promise<void> {
    this.render();
  }

  override getState(): Record<string, unknown> {
    return { ...super.getState(), file: this.pinnedFile };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.pinnedFile = parseViewState(state).file;
    this.render();
    await super.setState(state, result);
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.createDiv({
      cls: 'mind-mapper-placeholder',
      text: this.pinnedFile === null ? 'No note selected' : `Mind map: ${this.pinnedFile}`,
    });
  }
}
