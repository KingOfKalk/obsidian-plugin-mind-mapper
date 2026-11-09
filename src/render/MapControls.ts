import { setIcon } from 'obsidian';

export interface MapActions {
  zoomIn(): void;
  zoomOut(): void;
  fitToView(): void;
  resetZoom(): void;
  collapseAll(): void;
  expandAll(): void;
  backToRoot(): void;
  toggleFullScreen(): void;
}

/** Floating Canvas-style controls, bottom center. */
export class MapControls {
  private readonly resetButton: HTMLButtonElement;
  private readonly collapseButton: HTMLButtonElement;
  private anyCollapsed = false;

  constructor(parentEl: HTMLElement, actions: MapActions) {
    const el = parentEl.createDiv({ cls: 'mind-mapper-controls' });
    const button = (label: string, action: () => void, icon?: string): HTMLButtonElement => {
      const b = el.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
      if (icon) setIcon(b, icon);
      b.addEventListener('click', action);
      return b;
    };
    button('Zoom out', () => actions.zoomOut(), 'zoom-out');
    this.resetButton = button('Reset zoom to 100%', () => actions.resetZoom());
    button('Zoom in', () => actions.zoomIn(), 'zoom-in');
    button('Fit to view', () => actions.fitToView(), 'maximize');
    // One button for both (spec "Collapse / expand"): it shows the state, see setCollapsed.
    this.collapseButton = button('Collapse all', () =>
      this.anyCollapsed ? actions.expandAll() : actions.collapseAll(),
    );
    button('Back to root', () => actions.backToRoot(), 'locate');
    button('Toggle full screen', () => actions.toggleFullScreen(), 'maximize-2');
    this.setZoom(1);
    this.setCollapsed(false);
  }

  /** While any node is collapsed the button expands all (highlighted), otherwise it collapses all. */
  setCollapsed(anyCollapsed: boolean): void {
    this.anyCollapsed = anyCollapsed;
    const b = this.collapseButton;
    b.setAttribute('aria-label', anyCollapsed ? 'Expand all' : 'Collapse all');
    b.toggleClass('is-active', anyCollapsed);
    setIcon(b, anyCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
  }

  setZoom(zoom: number): void {
    this.resetButton.setText(`${Math.round(zoom * 100)}%`);
  }
}
