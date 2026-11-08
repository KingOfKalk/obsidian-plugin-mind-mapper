import { edgePath } from '../layout/edgePath';
import type { MapLayout } from '../layout/types';
import { type Transform, transformCss } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Renderer boundary from the spec; a three.js renderer is a future implementation. */
export interface MapRenderer {
  readonly canvasEl: HTMLElement;
  setLayout(layout: MapLayout): void;
  setTransform(t: Transform): void;
}

/** Absolutely positioned node divs plus one SVG edge layer inside a CSS-transformed world. */
export class DomMapRenderer implements MapRenderer {
  readonly canvasEl: HTMLElement;
  private readonly worldEl: HTMLElement;

  constructor(parentEl: HTMLElement) {
    this.canvasEl = parentEl.createDiv({ cls: 'mind-mapper-canvas' });
    this.worldEl = this.canvasEl.createDiv({ cls: 'mind-mapper-world' });
  }

  setLayout(layout: MapLayout): void {
    this.worldEl.empty();
    const doc = this.worldEl.doc;

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.classList.add('mind-mapper-edges');
    for (const edge of layout.edges) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.classList.add('mind-mapper-edge');
      path.setAttribute('d', edgePath(edge));
      svg.appendChild(path);
    }
    this.worldEl.appendChild(svg);

    for (const { node, x, y, width, height } of layout.nodes) {
      const el = this.worldEl.createDiv({
        cls: node.kind === 'root' ? 'mind-mapper-node is-root' : 'mind-mapper-node',
        attr: { 'data-node-id': node.id, title: node.label },
      });
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.createDiv({ cls: 'mind-mapper-node-label', text: node.label });
    }
  }

  setTransform(t: Transform): void {
    this.worldEl.style.transform = transformCss(t);
  }
}
