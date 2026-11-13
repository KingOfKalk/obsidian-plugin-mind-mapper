/**
 * Stable IDs of the plugin's DOM elements (issue #33), written as `data-mm-id`. Catalog with names
 * and purposes: docs/ui-elements.md (kept in sync by tests/elementIds.test.ts). A new element gets
 * a member here and a catalog row.
 *
 * The ID names what an element is and never changes with its state. A state worth querying (issue
 * #36) goes into `data-mm-state`, listed per ID in ELEMENT_STATES and in the catalog.
 */
export type ElementId =
  | 'ribbon.open-mind-map'
  | 'map.canvas'
  | 'map.placeholder'
  | 'map.empty-hint'
  | 'map.update-error'
  | 'node.root'
  | 'node.text'
  | 'node.block'
  | 'node.expand'
  | 'node.toggle'
  | 'node.drill-marker'
  | 'node.card-count'
  | 'node.tag'
  | 'node.tags'
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

export const ELEMENT_STATE_ATTR = 'data-mm-state';

/**
 * The `data-mm-state` values per ID (issue #36); IDs not listed have no state. Convention for the
 * highlighted buttons: `active` while highlighted, no attribute otherwise. The catalog lists the
 * same states (tests/elementIds.test.ts).
 */
export const ELEMENT_STATES = {
  'node.toggle': ['expanded', 'collapsed'],
  'controls.collapse-all': ['active'],
  'controls.drill': ['active'],
  'controls.layout': ['active'],
  'controls.theme': ['active'],
} as const satisfies Partial<Record<ElementId, readonly string[]>>;

export type StatefulElementId = keyof typeof ELEMENT_STATES;
export type ElementState<I extends StatefulElementId> = (typeof ELEMENT_STATES)[I][number];

/** The only writer of `data-mm-state`; `null` removes it (no state). Only writes on a change. */
export function setElementState<I extends StatefulElementId>(
  el: Element,
  _id: I,
  state: ElementState<I> | null,
): void {
  if (state === null) {
    if (el.hasAttribute(ELEMENT_STATE_ATTR)) el.removeAttribute(ELEMENT_STATE_ATTR);
  } else if (el.getAttribute(ELEMENT_STATE_ATTR) !== state) {
    el.setAttribute(ELEMENT_STATE_ATTR, state);
  }
}
