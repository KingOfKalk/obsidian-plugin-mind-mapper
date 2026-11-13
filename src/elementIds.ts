/**
 * Stable IDs of the plugin's DOM elements (issue #33), written as `data-mm-id`. Catalog with names
 * and purposes: docs/ui-elements.md (kept in sync by tests/elementIds.test.ts). A new element gets
 * a member here and a catalog row.
 */
export type ElementId =
  | 'ribbon.open-mind-map'
  | 'map.canvas'
  | 'map.placeholder'
  | 'map.empty-hint'
  | 'node.root'
  | 'node.text'
  | 'node.block'
  | 'node.expand'
  | 'node.toggle'
  | 'node.hidden-count'
  | 'node.drill-marker'
  | 'edge'
  | 'divider'
  | 'skeleton'
  | 'link.line'
  | 'link.hit-area'
  | 'link.highlight'
  | 'controls.bar'
  | 'controls.zoom-out'
  | 'controls.zoom-field'
  | 'controls.zoom-input'
  | 'controls.zoom-presets'
  | 'controls.zoom-in'
  | 'controls.fit'
  | 'controls.collapse-all'
  | 'controls.back-to-root'
  | 'controls.drill'
  | 'controls.layout'
  | 'controls.theme'
  | 'controls.full-screen'
  | 'fullscreen.overlay'
  | 'fullscreen.title-chip'
  | 'fullscreen.exit'
  | 'modal.node-content';

export const ELEMENT_ID_ATTR = 'data-mm-id';

/** Writes the element's ID; only when it changes (the renderer reconciles once per frame). */
export function setElementId(el: Element, id: ElementId): void {
  if (el.getAttribute(ELEMENT_ID_ATTR) !== id) el.setAttribute(ELEMENT_ID_ATTR, id);
}
