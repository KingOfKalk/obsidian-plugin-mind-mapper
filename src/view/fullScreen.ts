import { setIcon } from 'obsidian';
import { t } from '../i18n';

/** Spec "Full screen": controls fade after about 2 s without mouse movement. */
export const IDLE_MS = 2000;

export interface FullScreenOptions {
  /** The view's content element; moved into the overlay and back. */
  contentEl: HTMLElement;
  title: () => string;
  /** The exit button was clicked. */
  onExit: () => void;
}

/**
 * Spec "Full screen": a workspace overlay, not the browser Fullscreen API, so notices, menus,
 * modals and hover previews (attached to the body above it) stay visible. The view's content is
 * moved into a fixed layer on its own window's body and back to the same place on exit.
 */
export class FullScreen {
  private overlay: HTMLElement | null = null;
  private home: { parent: Node; next: Node | null } | null = null;
  private idleTimer: number | null = null;

  constructor(private readonly options: FullScreenOptions) {}

  get active(): boolean {
    return this.overlay !== null;
  }

  enter(): void {
    const { contentEl } = this.options;
    const parent = contentEl.parentNode;
    if (this.overlay || !parent) return;
    this.home = { parent, next: contentEl.nextSibling };
    const overlay = contentEl.doc.body.createDiv({ cls: 'mind-mapper-full-screen' });
    overlay.appendChild(contentEl);
    overlay.createDiv({ cls: 'mind-mapper-title-chip', text: this.options.title() });
    const exit = overlay.createEl('button', {
      cls: 'mind-mapper-exit-full-screen clickable-icon',
      attr: { 'aria-label': t('exitFullScreen') },
    });
    setIcon(exit, 'x');
    exit.addEventListener('click', () => this.options.onExit());
    overlay.addEventListener('mousemove', () => this.wake());
    this.overlay = overlay;
    this.wake();
  }

  exit(): void {
    const { overlay, home } = this;
    if (!overlay) return;
    this.clearTimer();
    if (home) home.parent.insertBefore(this.options.contentEl, home.next);
    overlay.remove();
    this.overlay = null;
    this.home = null;
  }

  private wake(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    overlay.removeClass('is-idle');
    this.clearTimer();
    this.idleTimer = this.options.contentEl.win.setTimeout(() => {
      this.idleTimer = null;
      overlay.addClass('is-idle');
    }, IDLE_MS);
  }

  private clearTimer(): void {
    if (this.idleTimer === null) return;
    this.options.contentEl.win.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
