import { type App, Component, MarkdownRenderer } from 'obsidian';
import type { MindMapNode } from '../parser/types';

export const RENDER_TIMEOUT_MS = 5000;

/** Read-only nodes: task checkboxes must not edit the note. */
export function disableCheckboxes(el: HTMLElement): void {
  for (const input of Array.from(el.querySelectorAll('input[type="checkbox"]'))) {
    (input as HTMLInputElement).disabled = true;
  }
}

/**
 * Renders node markdown with Obsidian. Each node gets a child Component of `parent` (spec
 * "Render ownership"), unloaded on release. A render that throws or exceeds the timeout shows the
 * raw markdown with `is-render-error` on the node element.
 */
export class NodeContentRenderer {
  private readonly owners = new Map<HTMLElement, Component>();
  /** Pending render timeouts, cleared on release. */
  private readonly timers = new Map<HTMLElement, () => void>();

  constructor(
    private readonly app: App,
    private readonly sourcePath: () => string,
    private readonly parent: Component,
  ) {}

  async render(node: MindMapNode, contentEl: HTMLElement): Promise<void> {
    this.release(contentEl);
    const owner = this.parent.addChild(new Component());
    this.owners.set(contentEl, owner);
    const isCurrent = (): boolean => this.owners.get(contentEl) === owner;

    try {
      await withTimeout(
        MarkdownRenderer.render(this.app, node.markdown, contentEl, this.sourcePath(), owner),
        RENDER_TIMEOUT_MS,
        contentEl,
        (cancel) => this.timers.set(contentEl, cancel),
      );
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Mind Mapper: node render failed', node.id, error);
      contentEl.empty();
      contentEl.setText(node.markdown);
      contentEl.parentElement?.addClass('is-render-error');
    }
    if (isCurrent()) disableCheckboxes(contentEl);
  }

  release(contentEl: HTMLElement): void {
    this.timers.get(contentEl)?.();
    this.timers.delete(contentEl);
    const owner = this.owners.get(contentEl);
    if (!owner) return;
    this.owners.delete(contentEl);
    this.parent.removeChild(owner);
  }

  releaseAll(): void {
    for (const contentEl of [...this.owners.keys()]) this.release(contentEl);
  }
}

function withTimeout(
  promise: Promise<void>,
  ms: number,
  el: HTMLElement,
  onTimer: (cancel: () => void) => void,
): Promise<void> {
  const win = el.win;
  return new Promise<void>((resolve, reject) => {
    const timer = win.setTimeout(() => reject(new Error(`render timed out after ${ms} ms`)), ms);
    onTimer(() => win.clearTimeout(timer));
    promise.then(
      () => {
        win.clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        win.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
