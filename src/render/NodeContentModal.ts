import {
  type App,
  Component,
  type HoverParent,
  MarkdownRenderer,
  Modal,
  type WorkspaceLeaf,
} from 'obsidian';
import { setElementId } from '../elementIds';
import type { MindMapNode } from '../parser/types';
import type { LeafRecency } from '../leafRecency';
import { attachLinkHandling } from './linkHandling';
import { setTextTags, splitNestedTags } from './nestedTags';
import { type TagPosition, tagPositionClass } from '../tagPositions';
import { disableCheckboxes } from './NodeContentRenderer';

export interface ModalLinkContext {
  sourcePath: () => string;
  hoverParent: HoverParent;
  mapLeaf: WorkspaceLeaf | null;
  recency: LeafRecency;
  /** The tags mode of the map (issue #105): the overlay shows tags the same way. */
  tagPosition: TagPosition;
  /** After an internal link in the overlay opened (e.g. leave full screen). */
  onNavigate?: () => void;
}

/** Pop-up overlay with the full content of a clipped node; links work like in the map. */
export class NodeContentModal extends Modal {
  private readonly owner = new Component();

  constructor(
    app: App,
    private readonly node: MindMapNode,
    private readonly link: ModalLinkContext,
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.owner.load();
    setElementId(this.modalEl, 'modal.node-content');
    this.contentEl.addClass(
      'mind-mapper-full-content',
      'markdown-rendered',
      tagPositionClass(this.link.tagPosition),
    );
    attachLinkHandling(this.contentEl, {
      ...this.link,
      app: this.app,
      events: this.owner,
      onNavigate: () => {
        this.close();
        this.link.onNavigate?.();
      },
    });
    try {
      await MarkdownRenderer.render(
        this.app,
        this.node.markdown,
        this.contentEl,
        this.link.sourcePath(),
        this.owner,
      );
      disableCheckboxes(this.contentEl);
      splitNestedTags(this.contentEl);
      setTextTags(this.contentEl, this.link.tagPosition === 'text');
    } catch (error) {
      console.error('Mind Mapper: full content render failed', error);
      this.contentEl.setText(this.node.markdown);
    }
  }

  override onClose(): void {
    this.owner.unload();
    this.contentEl.empty();
  }
}
