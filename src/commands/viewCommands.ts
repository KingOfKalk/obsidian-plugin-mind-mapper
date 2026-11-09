import type { Plugin } from 'obsidian';
import type { MessageKey } from '../i18n/en';
import { t } from '../i18n';
import { MindMapView } from '../view/MindMapView';

const VIEW_COMMANDS: {
  id: string;
  name: MessageKey;
  /** Only while the view shows a map, not a placeholder. */
  needsMap?: true;
  /** Only while this holds (drill-down: when it does something). */
  available?: (view: MindMapView) => boolean;
  run: (view: MindMapView) => void;
}[] = [
  { id: 'zoom-in', name: 'zoomIn', run: (view) => view.zoomIn() },
  { id: 'zoom-out', name: 'zoomOut', run: (view) => view.zoomOut() },
  { id: 'fit-to-view', name: 'fitToView', run: (view) => view.fitToView() },
  { id: 'reset-zoom', name: 'resetZoom', run: (view) => view.resetZoom() },
  { id: 'collapse-all', name: 'collapseAll', run: (view) => view.collapseAll() },
  { id: 'expand-all', name: 'expandAll', run: (view) => view.expandAll() },
  { id: 'back-to-root', name: 'backToRoot', run: (view) => view.backToRoot() },
  { id: 'toggle-full-screen', name: 'toggleFullScreen', run: (view) => view.toggleFullScreen() },
  // The pickers are the control bar menus, opened at their buttons.
  {
    id: 'change-layout',
    needsMap: true,
    name: 'changeLayout',
    run: (view) => view.showLayoutMenu(),
  },
  { id: 'next-layout', needsMap: true, name: 'nextLayout', run: (view) => view.nextLayout() },
  { id: 'change-theme', needsMap: true, name: 'changeTheme', run: (view) => view.showThemeMenu() },
  { id: 'next-theme', needsMap: true, name: 'nextTheme', run: (view) => view.nextTheme() },
  // Spec "Drill-down"; the key D is handled by the view itself (no default hotkey here).
  {
    id: 'drill-down',
    needsMap: true,
    name: 'drillDown',
    available: (view) => view.canDrillDown(),
    run: (view) => view.drillDown(),
  },
  {
    id: 'drill-out',
    needsMap: true,
    name: 'drillOut',
    available: (view) => view.isDrilled,
    run: (view) => view.drillOut(),
  },
  {
    id: 'show-whole-map',
    needsMap: true,
    name: 'showWholeMap',
    available: (view) => view.isDrilled,
    run: (view) => view.showWholeMap(),
  },
];

/**
 * Commands that act on the active mind map view; hidden when none is active, the switcher ones
 * also while it shows a placeholder instead of a map, the drill-down ones when they would do
 * nothing. No default hotkeys.
 */
export function registerViewCommands(plugin: Plugin): void {
  for (const { id, name, needsMap, available, run } of VIEW_COMMANDS) {
    plugin.addCommand({
      id,
      name: t(name),
      checkCallback: (checking) => {
        const view = plugin.app.workspace.getActiveViewOfType(MindMapView);
        if (!view || (needsMap && !view.showsMap())) return false;
        if (available && !available(view)) return false;
        if (!checking) run(view);
        return true;
      },
    });
  }
}
