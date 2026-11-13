import { LAYOUT_NAMES, type MapLayoutName } from '../layout/types';
import { type MapThemeName, THEME_NAMES } from '../themeNames';

export interface MindMapViewState {
  file: string | null;
  /** Layout chosen in this map view (control bar or command), null: the note's layout. */
  layout: MapLayoutName | null;
  /** Color theme chosen in this map view, null: the note's theme. */
  theme: MapThemeName | null;
  /**
   * Drill-down path (issue #23): the IDs of the drilled-in nodes, outermost first; empty: the whole
   * map. The last one is the center of the map.
   */
  drill: string[];
}

/**
 * View state saved by Obsidian; older states without `layout` / `theme` have no overrides, without
 * `drill` they show the whole map.
 */
export function parseViewState(state: unknown): MindMapViewState {
  const data =
    typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
  const { file, layout, theme, drill } = data;
  return {
    file: typeof file === 'string' && file !== '' ? file : null,
    layout: LAYOUT_NAMES.includes(layout as MapLayoutName) ? (layout as MapLayoutName) : null,
    theme: THEME_NAMES.includes(theme as MapThemeName) ? (theme as MapThemeName) : null,
    drill: isDrillPath(drill) ? [...drill] : [],
  };
}

function isDrillPath(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id !== '');
}

export function fileBasename(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}
