import { type App, type Component, type HoverParent, Keymap, type WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_MIND_MAP } from '../constants';
import { type LeafRecency, pickNoteLeaf } from '../leafRecency';

/** Hover source id registered with the page preview core plugin. */
export const HOVER_SOURCE_ID = VIEW_TYPE_MIND_MAP;

const INTERNAL_LINK = 'a.internal-link';
const TAG = 'a.tag';

/**
 * Obsidian's private core plugin registry (`app.internalPlugins`), not in the public API: only
 * the part used here, everything optional so a missing or changed API is a no-op.
 */
interface InternalPlugins {
  getEnabledPluginById?(id: string): GlobalSearch | null | undefined;
}

/** The search core plugin's instance (private API). */
interface GlobalSearch {
  openGlobalSearch?(query: string): void;
}

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
 * Internal links inside `container` behave like in Obsidian: click opens (Ctrl/Cmd click and
 * middle click: new tab), hover shows page preview. A plain click opens in the most recent note
 * leaf, or a split when there is none, never in the map leaf. A click on a tag (with or without
 * modifier) opens the tag search, like reading view; middle click on a tag does nothing. Other
 * links (external, footnotes) are left to Obsidian.
 */
export function attachLinkHandling(container: HTMLElement, ctx: LinkContext): void {
  // Capture phase: runs before listeners on the node, so the click never reaches the node.
  ctx.events.registerDomEvent(
    container,
    'click',
    (event) => {
      const tag = linkFrom(event, TAG);
      if (tag) {
        // Not stopped: the renderer ignores clicks on links, so the selection stays as it was.
        if (!openTagSearch(ctx.app, tagText(tag))) return;
        event.preventDefault();
        ctx.onNavigate?.();
        return;
      }
      const link = linkFrom(event, INTERNAL_LINK);
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      open(ctx, linkText(link), Keymap.isModEvent(event));
      ctx.onNavigate?.();
    },
    { capture: true },
  );

  // Middle click opens a new tab like in reading view (Chromium sends it as `auxclick`, not
  // `click`; Obsidian's Keymap reads the middle button as "tab"). Other buttons are left alone.
  ctx.events.registerDomEvent(
    container,
    'auxclick',
    (event) => {
      const link = event.button === 1 ? linkFrom(event, INTERNAL_LINK) : null;
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

/**
 * Opens the global search with `tag:<tag>`, as reading view does on a tag click. There is no
 * public API for it: uses the search core plugin through `app.internalPlugins`, guarded. Returns
 * false (and does nothing) when that API is missing or the search core plugin is disabled.
 */
export function openTagSearch(app: App, tag: string): boolean {
  const { internalPlugins } = app as App & { internalPlugins?: InternalPlugins };
  const search = internalPlugins?.getEnabledPluginById?.('global-search');
  if (typeof search?.openGlobalSearch !== 'function') return false;
  search.openGlobalSearch(`tag:${tag}`);
  return true;
}

function linkFrom(event: Event, selector: string): HTMLElement | null {
  const target = event.target as Node | null;
  // instanceOf, not instanceof: works for nodes of popout windows too.
  if (!target?.instanceOf(HTMLElement)) return null;
  return target.closest<HTMLElement>(selector);
}

/** The full tag (`#project/alpha/backend`): the href Obsidian set, also for a nested-tag pill. */
function tagText(tag: HTMLElement): string {
  return tag.getAttribute('href') ?? tag.textContent ?? '';
}

function linkText(link: HTMLElement): string {
  return link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
}
