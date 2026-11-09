import type { Plugin } from 'obsidian';
import type { MessageKey } from '../i18n/en';
import { t } from '../i18n';
import { MindMapView } from '../view/MindMapView';

const VIEW_COMMANDS: { id: string; name: MessageKey; run: (view: MindMapView) => void }[] = [
  { id: 'zoom-in', name: 'zoomIn', run: (view) => view.zoomIn() },
  { id: 'zoom-out', name: 'zoomOut', run: (view) => view.zoomOut() },
  { id: 'fit-to-view', name: 'fitToView', run: (view) => view.fitToView() },
  { id: 'reset-zoom', name: 'resetZoom', run: (view) => view.resetZoom() },
  { id: 'collapse-all', name: 'collapseAll', run: (view) => view.collapseAll() },
  { id: 'expand-all', name: 'expandAll', run: (view) => view.expandAll() },
  { id: 'back-to-root', name: 'backToRoot', run: (view) => view.backToRoot() },
  { id: 'toggle-full-screen', name: 'toggleFullScreen', run: (view) => view.toggleFullScreen() },
  // The pickers are the control bar menus, opened at their buttons.
  { id: 'change-layout', name: 'changeLayout', run: (view) => view.showLayoutMenu() },
  { id: 'next-layout', name: 'nextLayout', run: (view) => view.nextLayout() },
  { id: 'change-theme', name: 'changeTheme', run: (view) => view.showThemeMenu() },
  { id: 'next-theme', name: 'nextTheme', run: (view) => view.nextTheme() },
];

/** Commands that act on the active mind map view; hidden when none is active. No default hotkeys. */
export function registerViewCommands(plugin: Plugin): void {
  for (const { id, name, run } of VIEW_COMMANDS) {
    plugin.addCommand({
      id,
      name: t(name),
      checkCallback: (checking) => {
        const view = plugin.app.workspace.getActiveViewOfType(MindMapView);
        if (!view) return false;
        if (!checking) run(view);
        return true;
      },
    });
  }
}
