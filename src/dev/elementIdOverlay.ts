import { ELEMENT_ID_ATTR } from '../elementIds';

/** Below this size (px, both sides) an element gets a slanted label above it (control buttons). */
const SMALL = 40;
/** Tries to move a label down past other labels before it is placed anyway. */
const MAX_SHIFTS = 8;

const LAYER_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  inset: '0',
  pointerEvents: 'none',
  zIndex: '99999',
  overflow: 'hidden',
};

const LABEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  font: '600 10px/14px var(--font-monospace, monospace)',
  color: '#ffe066',
  background: 'rgba(20, 20, 20, 0.85)',
  padding: '0 3px',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
};

const BOX_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  boxSizing: 'border-box',
  border: '1px dashed rgba(255, 170, 0, 0.75)',
};

type Box = { left: number; top: number; right: number; bottom: number; text: string };

/**
 * Dev-only (issue #33, command "Show element IDs"): a fixed layer above the window that labels
 * every element with an ID (src/elementIds.ts) with that ID and outlines it, updated every frame (nodes appear while
 * panning, menus and modals open). Inline styles: nothing of it ships in styles.css. The layer
 * takes no pointer events and does not change the layout.
 */
export class ElementIdOverlay {
  private layer: HTMLElement | null = null;
  private frame: number | null = null;

  get active(): boolean {
    return this.layer !== null;
  }

  toggle(doc: Document): void {
    if (this.active) this.hide();
    else this.show(doc);
  }

  show(doc: Document): void {
    this.hide();
    const layer = doc.body.createDiv({ cls: 'mind-mapper-dev-id-overlay' });
    Object.assign(layer.style, LAYER_STYLE);
    this.layer = layer;
    this.update();
  }

  hide(): void {
    if (this.frame !== null) this.layer?.win.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.layer?.remove();
    this.layer = null;
  }

  /** One pass: a label (and outline) per visible element; then the next frame. */
  update(): void {
    const layer = this.layer;
    if (!layer) return;
    const doc = layer.doc;
    const win = layer.win;
    const boxes = [...layer.querySelectorAll<HTMLElement>('.mind-mapper-dev-id-box')];
    const labels = [...layer.querySelectorAll<HTMLElement>('.mind-mapper-dev-id-label')];
    const placed: Box[] = [];
    let used = 0;
    for (const el of Array.from(doc.querySelectorAll(`[${ELEMENT_ID_ATTR}]`))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right < 0 || rect.bottom < 0) continue;
      if (rect.left > win.innerWidth || rect.top > win.innerHeight) continue;
      const text = el.getAttribute(ELEMENT_ID_ATTR) ?? '';
      const box = boxes[used] ?? layer.createDiv({ cls: 'mind-mapper-dev-id-box' });
      const label = labels[used] ?? layer.createDiv({ cls: 'mind-mapper-dev-id-label' });
      used++;
      Object.assign(box.style, BOX_STYLE, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      box.hidden = false;
      Object.assign(label.style, LABEL_STYLE);
      if (label.textContent !== text) label.textContent = text;
      label.hidden = !this.placeLabel(label, rect, text, placed);
    }
    for (const el of [...boxes.slice(used), ...labels.slice(used)]) el.hidden = true;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  /**
   * Small elements (buttons in a row): slanted above their centre, so neighbours do not collide.
   * Others: inside the top left corner, moved down past other labels; skipped when a label with
   * the same text is already there (many edges in one spot). False: not shown.
   */
  private placeLabel(label: HTMLElement, rect: DOMRect, text: string, placed: Box[]): boolean {
    if (rect.width < SMALL && rect.height < SMALL) {
      Object.assign(label.style, {
        left: `${rect.left + rect.width / 2}px`,
        top: `${rect.top - 16}px`,
        transform: 'rotate(-50deg)',
        transformOrigin: '0 100%',
      });
      return true;
    }
    const width = label.offsetWidth;
    const height = label.offsetHeight || 14;
    const left = Math.max(0, rect.left) + 1;
    let top = Math.max(0, rect.top) + 1;
    for (let shift = 0; shift < MAX_SHIFTS; shift++) {
      const hit = placed.find(
        (b) => left < b.right && left + width > b.left && top < b.bottom && top + height > b.top,
      );
      if (!hit) break;
      if (hit.text === text) return false;
      top = hit.bottom + 1;
    }
    placed.push({ left, top, right: left + width, bottom: top + height, text });
    Object.assign(label.style, {
      left: `${left}px`,
      top: `${top}px`,
      transform: '',
      transformOrigin: '',
    });
    return true;
  }
}
