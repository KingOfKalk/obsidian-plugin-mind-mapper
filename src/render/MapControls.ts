import { setIcon } from 'obsidian';
import { t } from '../i18n';

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
    button(t('zoomOut'), () => actions.zoomOut(), 'zoom-out');
    this.resetButton = button(t('resetZoom'), () => actions.resetZoom());
    button(t('zoomIn'), () => actions.zoomIn(), 'zoom-in');
    button(t('fitToView'), () => actions.fitToView(), 'maximize');
    // One button for both (spec "Collapse / expand"): it shows the state, see setCollapsed.
    this.collapseButton = button(t('collapseAll'), () =>
      this.anyCollapsed ? actions.expandAll() : actions.collapseAll(),
    );
    button(t('backToRoot'), () => actions.backToRoot(), 'locate');
    button(t('toggleFullScreen'), () => actions.toggleFullScreen(), 'maximize-2');
    this.setZoom(1);
    this.setCollapsed(false);
  }

  /** While any node is collapsed the button expands all (highlighted), otherwise it collapses all. */
  setCollapsed(anyCollapsed: boolean): void {
    this.anyCollapsed = anyCollapsed;
    const b = this.collapseButton;
    b.setAttribute('aria-label', t(anyCollapsed ? 'expandAll' : 'collapseAll'));
    b.toggleClass('is-active', anyCollapsed);
    setIcon(b, anyCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
  }

  setZoom(zoom: number): void {
    this.resetButton.setText(t('zoomPercent', { percent: Math.round(zoom * 100) }));
  }
}
