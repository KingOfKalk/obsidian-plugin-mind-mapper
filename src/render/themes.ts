/** Spec "Colour themes": `none` is the plain look; the others colour nodes and edges by level. */
export type MapThemeName = 'none' | 'rainbow' | 'ocean' | 'forest' | 'accent';

export const THEME_NAMES: readonly MapThemeName[] = [
  'none',
  'rainbow',
  'ocean',
  'forest',
  'accent',
];

/**
 * `data-level` cycles through 1..LEVEL_CYCLE: a multiple of every palette length in styles.css
 * (6 and 4), so each theme repeats its palette without the renderer knowing the theme.
 */
export const LEVEL_CYCLE = 12;

/** `data-level` of a node at `depth` (root 0: none). */
export function levelAttr(depth: number): string | null {
  return depth < 1 ? null : String(((depth - 1) % LEVEL_CYCLE) + 1);
}

export function themeClass(name: MapThemeName): string {
  return `mind-mapper-theme-${name}`;
}
