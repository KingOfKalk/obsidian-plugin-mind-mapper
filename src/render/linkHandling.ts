import { type App, type Component, type HoverParent, Keymap, type WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MIND_MAP } from '../constants';
import { type LeafRecency, pickNoteLeaf } from '../view/leafRecency';

/** Hover source id registered with the page preview core plugin. */
export const HOVER_SOURCE_ID = VIEW_TYPE_MIND_MAP;

const INTERNAL_LINK = 'a.internal-link';

export interface LinkContext {
  app: App;
  /** Owner of the DOM listeners (removed when it unloads). */
  events: Component;
  hoverParent: HoverParent;
  /** The map's own leaf: a plain click must never open a note in it. */
  mapLeaf: WorkspaceLeaf | null;
  /** Which note leaf was active last (plain click target). */
  recency: LeafRecency;
  sourcePath: () => string;
  /** Called after an internal link was opened (e.g. to close an overlay). */
  onNavigate?: () => void;
}

/**
 * Internal links inside `container` behave like in Obsidian: click opens (Ctrl/Cmd: new tab),
 * hover shows page preview. A plain click opens in the most recent note leaf, or a split when there
 * is none, never in the map leaf. Other links (external, tags, footnotes) are left to Obsidian.
 */
export function attachLinkHandling(container: HTMLElement, ctx: LinkContext): void {
  // Capture phase: runs before listeners on the node, so the click never reaches the node.
  ctx.events.registerDomEvent(
    container,
    'click',
    (event) => {
      const link = linkFrom(event, INTERNAL_LINK);
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      open(ctx, linkText(link), Keymap.isModEvent(event));
      ctx.onNavigate?.();
    },
    { capture: true },
  );

  ctx.events.registerDomEvent(container, 'mouseover', (event) => {
    const link = linkFrom(event, INTERNAL_LINK);
    if (!link) return;
    ctx.app.workspace.trigger('hover-link', {
      event,
      source: HOVER_SOURCE_ID,
      hoverParent: ctx.hoverParent,
      targetEl: link,
      linktext: linkText(link),
      sourcePath: ctx.sourcePath(),
    });
  });
}

function open(ctx: LinkContext, linktext: string, mod: ReturnType<typeof Keymap.isModEvent>): void {
  const { workspace } = ctx.app;
  if (mod) {
    void workspace.openLinkText(linktext, ctx.sourcePath(), mod);
    return;
  }
  const target = pickNoteLeaf(workspace, ctx.recency, { mapLeaf: ctx.mapLeaf });
  if (target) {
    workspace.setActiveLeaf(target, { focus: true });
    void workspace.openLinkText(linktext, ctx.sourcePath(), false);
  } else {
    void workspace.openLinkText(linktext, ctx.sourcePath(), 'split');
  }
}

function linkFrom(event: Event, selector: string): HTMLElement | null {
  const target = event.target as Node | null;
  // instanceOf, not instanceof: works for nodes of popout windows too.
  if (!target?.instanceOf(HTMLElement)) return null;
  return target.closest<HTMLElement>(selector);
}

function linkText(link: HTMLElement): string {
  return link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
}
