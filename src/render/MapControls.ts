import { setIcon } from 'obsidian';

export interface MapActions {
  zoomIn(): void;
  zoomOut(): void;
  fitToView(): void;
  resetZoom(): void;
  backToRoot(): void;
  toggleFullScreen(): void;
}

/** Floating Canvas-style controls, bottom center. */
export class MapControls {
  private readonly resetButton: HTMLButtonElement;

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
    button('Back to root', () => actions.backToRoot(), 'locate');
    button('Toggle full screen', () => actions.toggleFullScreen(), 'maximize-2');
    this.setZoom(1);
  }

  setZoom(zoom: number): void {
    this.resetButton.setText(`${Math.round(zoom * 100)}%`);
  }
}
