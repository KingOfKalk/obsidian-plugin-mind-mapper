import { Menu, setIcon } from 'obsidian';
import { type ElementId, setElementId, setElementState } from '../elementIds';
import { t } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { LAYOUT_LABELS, THEME_LABELS } from '../i18n/labels';
import { LAYOUT_NAMES, type MapLayoutName } from '../layout/types';
import { type MapThemeName, THEME_NAMES } from './themes';
import { parseZoomPercent } from './viewport';

export interface MapActions {
  zoomIn(): void;
  zoomOut(): void;
  /** Zoom (1 = 100 %) centred on the canvas. */
  zoomTo(zoom: number): void;
  fitToView(): void;
  collapseAll(): void;
  expandAll(): void;
  backToRoot(): void;
  toggleFullScreen(): void;
  /** Layout of this map view only; null: the note's layout again. */
  chooseLayout(layout: MapLayoutName | null): void;
  /** Colour theme of this map view only; null: the note's theme again. */
  chooseTheme(theme: MapThemeName | null): void;
  /** Drill-down (issue #23): into the selected node, else out one level. */
  drill(): void;
}

/** What the drill-down button does now; null: nothing (disabled). */
export type DrillAction = 'in' | 'out' | null;

/** Zoom presets of the menu next to the zoom input, in percent. */
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

/** Floating Canvas-style controls, bottom center. */
export class MapControls {
  private readonly zoomInput: HTMLInputElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly layoutButton: HTMLButtonElement;
  private readonly themeButton: HTMLButtonElement;
  private readonly drillButton: HTMLButtonElement;
  private anyCollapsed = false;
  private layout: MapLayoutName | null = null;
  private theme: MapThemeName | null = null;
  private zoom = 1;
  /** True while the zoom input holds typed text not yet applied. */
  private editing = false;

  constructor(
    parentEl: HTMLElement,
    private readonly actions: MapActions,
  ) {
    const el = parentEl.createDiv({ cls: 'mind-mapper-controls' });
    setElementId(el, 'controls.bar');
    const button = (
      id: ElementId,
      label: string,
      action: () => void,
      icon?: string,
    ): HTMLButtonElement => {
      const b = el.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
      setElementId(b, id);
      if (icon) setIcon(b, icon);
      b.addEventListener('click', action);
      return b;
    };
    button('controls.zoom-out', t('zoomOut'), () => actions.zoomOut(), 'zoom-out');
    // One child of the bar, so the buttons after it keep their positions.
    const field = el.createDiv({ cls: 'mind-mapper-zoom-field' });
    setElementId(field, 'controls.zoom-field');
    this.zoomInput = this.createZoomInput(field);
    const menuButton = field.createEl('button', {
      cls: 'clickable-icon mind-mapper-zoom-menu',
      attr: { 'aria-label': t('zoomPresets') },
    });
    setElementId(menuButton, 'controls.zoom-presets');
    // Up: the bar sits at the bottom, the menu opens above it.
    setIcon(menuButton, 'chevron-up');
    menuButton.addEventListener('click', () => this.showZoomMenu(menuButton));
    button('controls.zoom-in', t('zoomIn'), () => actions.zoomIn(), 'zoom-in');
    // `group` (nodes inside a frame): distinct from the corner brackets of `maximize`, which read
    // as full screen next to `maximize-2`.
    button('controls.fit', t('fitToView'), () => actions.fitToView(), 'group');
    // One button for both (spec "Collapse / expand"): it shows the state, see setCollapsed.
    this.collapseButton = button('controls.collapse-all', t('collapseAll'), () =>
      this.anyCollapsed ? actions.expandAll() : actions.collapseAll(),
    );
    button('controls.back-to-root', t('backToRoot'), () => actions.backToRoot(), 'locate');
    this.drillButton = button(
      'controls.drill',
      t('drillDown'),
      () => actions.drill(),
      'arrow-down-to-dot',
    );
    this.drillButton.addClass('mind-mapper-drill');
    // `workflow` (boxes joined by a line): the arrangement of the nodes; distinct from `group` (fit)
    // and the view icon `network`.
    this.layoutButton = button(
      'controls.layout',
      t('layoutMenu'),
      () => this.showLayoutMenu(),
      'workflow',
    );
    this.themeButton = button(
      'controls.theme',
      t('themeMenu'),
      () => this.showThemeMenu(),
      'palette',
    );
    button(
      'controls.full-screen',
      t('toggleFullScreen'),
      () => actions.toggleFullScreen(),
      'maximize-2',
    );
    this.setZoom(1);
    this.setCollapsed(false);
    this.setDrill(null, false);
  }

  /**
   * Drill-down button (issue #23): enabled while it can drill in (a selected node with children) or
   * out (drilled in); highlighted while drilled in.
   */
  setDrill(action: DrillAction, drilled: boolean): void {
    const b = this.drillButton;
    b.disabled = action === null;
    b.setAttribute('aria-label', t(action === 'out' ? 'drillOut' : 'drillDown'));
    b.toggleClass('is-active', drilled);
    setElementState(b, 'controls.drill', drilled ? 'active' : null);
  }

  /** While any node is collapsed the button expands all (highlighted), otherwise it collapses all. */
  setCollapsed(anyCollapsed: boolean): void {
    this.anyCollapsed = anyCollapsed;
    const b = this.collapseButton;
    b.setAttribute('aria-label', t(anyCollapsed ? 'expandAll' : 'collapseAll'));
    b.toggleClass('is-active', anyCollapsed);
    setElementState(b, 'controls.collapse-all', anyCollapsed ? 'active' : null);
    setIcon(b, anyCollapsed ? 'chevrons-up-down' : 'chevrons-down-up');
  }

  /** The shown layout; while this view overrides the note's layout the button is highlighted. */
  setLayout(layout: MapLayoutName, overridden: boolean): void {
    this.layout = layout;
    this.layoutButton.toggleClass('is-active', overridden);
    setElementState(this.layoutButton, 'controls.layout', overridden ? 'active' : null);
  }

  /** The shown colour theme; while this view overrides the note's theme the button is highlighted. */
  setTheme(theme: MapThemeName, overridden: boolean): void {
    this.theme = theme;
    this.themeButton.toggleClass('is-active', overridden);
    setElementState(this.themeButton, 'controls.theme', overridden ? 'active' : null);
  }

  /** The six layouts, the shown one checked, then "Use the note's layout"; above its button. */
  showLayoutMenu(): void {
    this.showChoiceMenu(
      this.layoutButton,
      LAYOUT_NAMES,
      LAYOUT_LABELS,
      this.layout,
      'useNoteLayout',
      (layout) => this.actions.chooseLayout(layout),
    );
  }

  /** The colour themes, the shown one checked, then "Use the note's theme"; above its button. */
  showThemeMenu(): void {
    this.showChoiceMenu(
      this.themeButton,
      THEME_NAMES,
      THEME_LABELS,
      this.theme,
      'useNoteTheme',
      (theme) => this.actions.chooseTheme(theme),
    );
  }

  private showChoiceMenu<T extends string>(
    anchor: HTMLElement,
    values: readonly T[],
    labels: Readonly<Record<T, MessageKey>>,
    current: T | null,
    reset: MessageKey,
    choose: (value: T | null) => void,
  ): void {
    const menu = new Menu();
    for (const value of values) {
      menu.addItem((item) =>
        item
          .setTitle(t(labels[value]))
          .setChecked(value === current)
          .onClick(() => choose(value)),
      );
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t(reset)).onClick(() => choose(null)));
    showAbove(menu, anchor);
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    // Typed text stays until Enter, Esc or leaving the input.
    if (!this.editing) this.zoomInput.value = formatZoom(zoom);
  }

  /** True for key events typed into the controls (the zoom input), which handle them. */
  ownsKeys(target: EventTarget | null): boolean {
    return target === this.zoomInput;
  }

  /** Shows the current zoom again, dropping typed text. */
  private restoreZoom(): void {
    this.editing = false;
    this.zoomInput.value = formatZoom(this.zoom);
  }

  private createZoomInput(parentEl: HTMLElement): HTMLInputElement {
    const input = parentEl.createEl('input', {
      cls: 'mind-mapper-zoom-input',
      attr: {
        type: 'text',
        inputmode: 'decimal',
        spellcheck: 'false',
        'aria-label': t('zoomLevel'),
      },
    });
    setElementId(input, 'controls.zoom-input');
    // A click focuses and selects; its mouseup would place the caret instead, so it is dropped once.
    let selectedByFocus = false;
    input.addEventListener('focus', () => {
      input.select();
      selectedByFocus = true;
    });
    input.addEventListener('mouseup', (event) => {
      if (selectedByFocus) event.preventDefault();
      selectedByFocus = false;
    });
    input.addEventListener('input', () => {
      this.editing = true;
      selectedByFocus = false;
    });
    input.addEventListener('blur', () => this.restoreZoom());
    // Typing must not trigger map keys or Obsidian hotkeys (Esc would leave full screen).
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      input.addEventListener(type, (event) => event.stopPropagation());
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const zoom = this.editing ? parseZoomPercent(input.value) : null;
        this.restoreZoom();
        if (zoom !== null) this.actions.zoomTo(zoom);
        input.select();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.restoreZoom();
        input.blur();
      }
    });
    return input;
  }

  private showZoomMenu(anchor: HTMLElement): void {
    const current = Math.round(this.zoom * 100);
    const menu = new Menu();
    for (const percent of ZOOM_PRESETS) {
      menu.addItem((item) =>
        item
          .setTitle(t('zoomPercent', { percent }))
          .setChecked(percent === current)
          .onClick(() => this.actions.zoomTo(percent / 100)),
      );
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t('fitToView')).onClick(() => this.actions.fitToView()));
    showAbove(menu, anchor);
  }
}

/**
 * At the anchor's top left corner; a menu that does not fit below it (the bar sits at the bottom)
 * is moved up by Obsidian, above the bar.
 */
function showAbove(menu: Menu, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  // The anchor's document: works in popout windows too.
  menu.showAtPosition({ x: rect.left, y: rect.top }, anchor.ownerDocument);
}

function formatZoom(zoom: number): string {
  return t('zoomPercent', { percent: Math.round(zoom * 100) });
}
