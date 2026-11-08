import type { Plugin } from 'obsidian';
import { MindMapView } from '../view/MindMapView';

const VIEW_COMMANDS = [
  { id: 'zoom-in', name: 'Zoom in', run: (view: MindMapView) => view.zoomIn() },
  { id: 'zoom-out', name: 'Zoom out', run: (view: MindMapView) => view.zoomOut() },
  { id: 'fit-to-view', name: 'Fit to view', run: (view: MindMapView) => view.fitToView() },
  { id: 'reset-zoom', name: 'Reset zoom to 100%', run: (view: MindMapView) => view.resetZoom() },
  { id: 'collapse-all', name: 'Collapse all', run: (view: MindMapView) => view.collapseAll() },
  { id: 'expand-all', name: 'Expand all', run: (view: MindMapView) => view.expandAll() },
  { id: 'back-to-root', name: 'Back to root', run: (view: MindMapView) => view.backToRoot() },
  {
    id: 'toggle-full-screen',
    name: 'Toggle full screen',
    run: (view: MindMapView) => view.toggleFullScreen(),
  },
];

/** Commands that act on the active mind map view; hidden when none is active. No default hotkeys. */
export function registerViewCommands(plugin: Plugin): void {
  for (const { id, name, run } of VIEW_COMMANDS) {
    plugin.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const view = plugin.app.workspace.getActiveViewOfType(MindMapView);
        if (!view) return false;
        if (!checking) run(view);
        return true;
      },
    });
  }
}
