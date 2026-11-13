import type { MapThemeName } from '../themeNames';

/** Number of colors of each palette in styles.css (`--mind-mapper-color-<n>`). */
export const PALETTE_SIZE: Readonly<Record<MapThemeName, number>> = {
  none: 1,
  rainbow: 7,
  ocean: 4,
  forest: 4,
  accent: 1,
};

/** `data-level` (emphasis) of a node at `depth`: 1, 2, or 3 for everything deeper; the root none. */
export function levelAttr(depth: number): string | null {
  return depth < 1 ? null : String(Math.min(depth, 3));
}

/**
 * `data-subtask` of a kanban subtask (issue #91): its depth below its card, 1, 2, or 3 for
 * everything deeper (a box lighter per depth); other nodes none.
 */
export function subtaskAttr(subtask: number | undefined): string | null {
  return subtask === undefined ? null : String(Math.min(subtask, 3));
}

/** `data-branch`: the palette color (1-based) of branch `branch` in `theme`; the root none. */
export function branchAttr(branch: number, theme: MapThemeName): string | null {
  return branch < 0 ? null : String((branch % PALETTE_SIZE[theme]) + 1);
}

export function themeClass(name: MapThemeName): string {
  return `mind-mapper-theme-${name}`;
}
