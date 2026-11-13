import { ELEMENT_ID_ATTR, ELEMENT_STATE_ATTR } from '../elementIds';

/** Below this size (px, both sides) an element gets its label beside it (toggles, icons). */
const SMALL = 40;
/** Tries to move a label past other labels before it is placed anyway. */
const MAX_SHIFTS = 8;
/** Elements in this row of buttons get slanted labels above them: straight ones would collide. */
const ROW = `[${ELEMENT_ID_ATTR}="controls.bar"]`;
/** Slanted labels start at least this far apart (px): the next one moves right. */
const SLANT_GAP = 18;

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
type Placed = { boxes: Box[]; slanted: number[] };

/**
 * Dev-only (issue #33, command "Show element IDs"): a fixed layer above the window that labels
 * every element with an ID (src/elementIds.ts) with that ID (and its state, `id [state]`) and outlines it, updated every frame
 * (nodes appear while panning, menus and modals open). Covered elements (behind the full screen
 * overlay) are left out. Inline styles: nothing of it ships in styles.css. The layer takes no
 * pointer events and does not change the layout.
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
    const placed: Placed = { boxes: [], slanted: [] };
    let used = 0;
    for (const el of Array.from(doc.querySelectorAll(`[${ELEMENT_ID_ATTR}]`))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right < 0 || rect.bottom < 0) continue;
      if (rect.left > win.innerWidth || rect.top > win.innerHeight) continue;
      if (covered(doc, el, rect)) continue;
      const state = el.getAttribute(ELEMENT_STATE_ATTR);
      const text = (el.getAttribute(ELEMENT_ID_ATTR) ?? '') + (state ? ` [${state}]` : '');
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
      label.hidden = !this.placeLabel(el, label, rect, text, placed, win.innerWidth);
    }
    for (const el of [...boxes.slice(used), ...labels.slice(used)]) el.hidden = true;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  /**
   * Elements of the control bar: slanted above them, moved right past close neighbours. Small
   * elements: on their right (left at the window edge), the bar below it, both moved down past other
   * labels. Others: just
   * above their top left corner (inside it at the window top), moved up past other labels. Skipped
   * when a label with the same text is in the way (many edges in one spot). False: not shown.
   */
  private placeLabel(
    el: Element,
    label: HTMLElement,
    rect: DOMRect,
    text: string,
    placed: Placed,
    windowWidth: number,
  ): boolean {
    if (el.parentElement?.closest(ROW)) {
      // Near the left edge: a field and its input start at the same x and are moved apart.
      let x = rect.left + Math.min(rect.width / 2, 14);
      while (placed.slanted.some((p) => Math.abs(p - x) < SLANT_GAP)) x += SLANT_GAP;
      placed.slanted.push(x);
      Object.assign(label.style, {
        left: `${x}px`,
        top: `${rect.top - 18}px`,
        transform: 'rotate(-60deg)',
        transformOrigin: '0 100%',
      });
      return true;
    }
    const width = label.offsetWidth;
    const height = label.offsetHeight || 14;
    let left: number;
    let top: number;
    let down: boolean;
    if (rect.width < SMALL && rect.height < SMALL) {
      left = rect.right + 2 + width > windowWidth ? rect.left - 2 - width : rect.right + 2;
      top = rect.top + rect.height / 2 - height / 2;
      down = true;
    } else if (el.matches(ROW)) {
      // Above it are the slanted labels of its buttons.
      left = Math.max(0, rect.left) + 1;
      top = rect.bottom + 1;
      down = true;
    } else {
      left = Math.max(0, rect.left) + 1;
      top = rect.top - height - 1;
      down = top < 0;
      if (down) top = Math.max(0, rect.top) + 1;
    }
    for (let shift = 0; shift < MAX_SHIFTS; shift++) {
      const hit = placed.boxes.find(
        (b) => left < b.right && left + width > b.left && top < b.bottom && top + height > b.top,
      );
      if (!hit) break;
      if (hit.text === text) return false;
      top = down ? hit.bottom + 1 : hit.top - height - 1;
    }
    placed.boxes.push({ left, top, right: left + width, bottom: top + height, text });
    Object.assign(label.style, {
      left: `${left}px`,
      top: `${top}px`,
      transform: '',
      transformOrigin: '',
    });
    return true;
  }
}

/**
 * True when something else is on top at the element's centre (the full screen overlay over the
 * ribbon). Only for elements the hit test can find: not for lines (a wide hit path covers its link
 * line) and not for elements without pointer events (the title chip).
 */
function covered(doc: Document, el: Element, rect: DOMRect): boolean {
  if (typeof doc.elementFromPoint !== 'function') return false;
  const win = doc.defaultView;
  if (!el.instanceOf(HTMLElement) || win?.getComputedStyle(el).pointerEvents === 'none') {
    return false;
  }
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), (win?.innerWidth ?? 1) - 1);
  const y = Math.min(Math.max(rect.top + rect.height / 2, 0), (win?.innerHeight ?? 1) - 1);
  const hit = doc.elementFromPoint(x, y);
  return hit !== null && !el.contains(hit) && !hit.contains(el);
}
