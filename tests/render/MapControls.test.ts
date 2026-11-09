import { MapControls } from '../../src/render/MapControls';
import { useGerman } from '../helpers';
import { Menu, type MenuItem } from '../mocks/obsidian';

function setup() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const actions = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    // Like the view: a new zoom comes back through setZoom.
    zoomTo: vi.fn((zoom: number) => controls.setZoom(zoom)),
    fitToView: vi.fn(),
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
    backToRoot: vi.fn(),
    toggleFullScreen: vi.fn(),
    chooseLayout: vi.fn(),
    chooseTheme: vi.fn(),
  };
  const controls = new MapControls(parent, actions);
  const buttons = [...parent.querySelectorAll<HTMLElement>('.mind-mapper-controls button')];
  const input = parent.querySelector<HTMLInputElement>('.mind-mapper-zoom-input');
  if (!input) throw new Error('no zoom input');
  return { parent, actions, controls, buttons, input };
}

function type(input: HTMLInputElement, text: string): void {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLInputElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  Menu.lastShown = null;
  document.body.replaceChildren();
});

test('renders the buttons in order with aria labels', () => {
  const { buttons } = setup();
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Zoom out',
    'Zoom presets',
    'Zoom in',
    'Fit to view',
    'Collapse all',
    'Back to root',
    'Layout',
    'Colour theme',
    'Toggle full screen',
  ]);
  expect(buttons.map((b) => b.dataset.icon)).toEqual([
    'zoom-out',
    'chevron-up',
    'zoom-in',
    'group',
    'chevrons-down-up',
    'locate',
    'workflow',
    'palette',
    'maximize-2',
  ]);
});

test('the zoom field (input and menu button) sits between zoom out and zoom in', () => {
  const { parent } = setup();
  const children = [...(parent.querySelector('.mind-mapper-controls')?.children ?? [])];
  expect(children[1]?.classList.contains('mind-mapper-zoom-field')).toBe(true);
  expect(children[1]?.querySelector('input')?.getAttribute('aria-label')).toBe('Zoom level');
  // The collapse button stays the fifth child (E2E and view tests use nth-child(5)).
  expect(children[4]?.getAttribute('aria-label')).toBe('Collapse all');
});

test('each button calls its action once', () => {
  const { actions, buttons } = setup();
  buttons.forEach((b) => b.click());
  expect(actions.expandAll).not.toHaveBeenCalled();
  expect(actions.zoomTo).not.toHaveBeenCalled();
  expect(actions.zoomOut).toHaveBeenCalledTimes(1);
  expect(actions.zoomIn).toHaveBeenCalledTimes(1);
  expect(actions.fitToView).toHaveBeenCalledTimes(1);
  expect(actions.collapseAll).toHaveBeenCalledTimes(1);
  expect(actions.backToRoot).toHaveBeenCalledTimes(1);
  expect(actions.toggleFullScreen).toHaveBeenCalledTimes(1);
  // The layout and theme buttons only open their menus.
  expect(actions.chooseLayout).not.toHaveBeenCalled();
  expect(actions.chooseTheme).not.toHaveBeenCalled();
});

test('the zoom input shows the zoom percentage', () => {
  const { controls, input } = setup();
  expect(input.value).toBe('100%');
  controls.setZoom(0.5);
  expect(input.value).toBe('50%');
  controls.setZoom(1.234);
  expect(input.value).toBe('123%');
});

test('focusing the zoom input selects its text', () => {
  const { input } = setup();
  input.focus();
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, '100%'.length]);
});

test.each([
  ['129', 1.29, '129%'],
  ['129 %', 1.29, '129%'],
  ['87,5', 0.875, '88%'],
  ['1000', 4, '400%'],
])('typing %j and Enter zooms to %f', (text, zoom, shown) => {
  const { actions, input } = setup();
  type(input, text);
  const event = press(input, 'Enter');
  expect(actions.zoomTo).toHaveBeenCalledExactlyOnceWith(zoom);
  expect(event.defaultPrevented).toBe(true);
  expect(input.value).toBe(shown);
  // Still focused with the new value selected: another value can be typed right away.
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, shown.length]);
});

test('invalid input and Enter restores the shown zoom', () => {
  const { actions, input } = setup();
  type(input, 'abc');
  press(input, 'Enter');
  expect(actions.zoomTo).not.toHaveBeenCalled();
  expect(input.value).toBe('100%');
});

test('Esc restores the shown zoom and leaves the input', () => {
  const { actions, controls, input } = setup();
  controls.setZoom(0.6);
  type(input, '250');
  const event = press(input, 'Escape');
  expect(actions.zoomTo).not.toHaveBeenCalled();
  expect(input.value).toBe('60%');
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).not.toBe(input);
});

test('leaving the input without Enter restores the shown zoom', () => {
  const { actions, input } = setup();
  type(input, '250');
  input.blur();
  expect(actions.zoomTo).not.toHaveBeenCalled();
  expect(input.value).toBe('100%');
});

test('a zoom change while typing keeps the typed text; Esc then shows the new zoom', () => {
  const { controls, input } = setup();
  type(input, '12');
  controls.setZoom(2);
  expect(input.value).toBe('12');
  press(input, 'Escape');
  expect(input.value).toBe('200%');
});

test('keys typed in the zoom input do not reach the map or Obsidian hotkeys', () => {
  const { parent, input } = setup();
  const outside = vi.fn();
  parent.addEventListener('keydown', outside);
  parent.addEventListener('keyup', outside);
  type(input, '1');
  for (const key of ['1', 'Backspace', 'Enter', 'Escape', 'a']) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }
  expect(outside).not.toHaveBeenCalled();
});

function titles(menu: Menu | null): (string | null)[] {
  return (menu?.entries ?? []).map((e) => (e === 'separator' ? null : e.title));
}

function checked(menu: Menu | null): string[] {
  return (menu?.items ?? []).filter((i) => i.checked).map((i) => i.title);
}

function item(menu: Menu | null, title: string): MenuItem | undefined {
  return menu?.items.find((i) => i.title === title);
}

test('the chevron opens the zoom menu next to it, the current preset checked', () => {
  const { parent, actions, controls, buttons } = setup();
  buttons[1]?.click();
  const menu = Menu.lastShown;
  expect(titles(menu)).toEqual(['50%', '75%', '100%', '125%', '150%', '200%', null, 'Fit to view']);
  expect(checked(menu)).toEqual(['100%']);
  expect(menu?.shownAt?.doc).toBe(parent.ownerDocument);

  void item(menu, '75%')?.clickHandler?.();
  expect(actions.zoomTo).toHaveBeenCalledExactlyOnceWith(0.75);
  void item(menu, 'Fit to view')?.clickHandler?.();
  expect(actions.fitToView).toHaveBeenCalledTimes(1);

  controls.setZoom(1.29);
  buttons[1]?.click();
  expect(checked(Menu.lastShown)).toEqual([]);
  controls.setZoom(1.5);
  buttons[1]?.click();
  expect(checked(Menu.lastShown)).toEqual(['150%']);
});

test('the collapse button shows the state: expand all while anything is collapsed', () => {
  const { actions, controls, buttons } = setup();
  const toggle = buttons[4];
  controls.setCollapsed(true);
  expect(toggle?.getAttribute('aria-label')).toBe('Expand all');
  expect(toggle?.dataset.icon).toBe('chevrons-up-down');
  expect(toggle?.classList.contains('is-active')).toBe(true);
  toggle?.click();
  expect(actions.expandAll).toHaveBeenCalledTimes(1);
  expect(actions.collapseAll).not.toHaveBeenCalled();
  controls.setCollapsed(false);
  expect(toggle?.getAttribute('aria-label')).toBe('Collapse all');
  expect(toggle?.dataset.icon).toBe('chevrons-down-up');
  expect(toggle?.classList.contains('is-active')).toBe(false);
  toggle?.click();
  expect(actions.collapseAll).toHaveBeenCalledTimes(1);
});

test('in German the labels, the menu, the collapse state and the zoom percentage are German', () => {
  useGerman();
  const { actions, controls, buttons, input } = setup();
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Verkleinern',
    'Zoomvorgaben',
    'Vergrößern',
    'An Ansicht anpassen',
    'Alle einklappen',
    'Zurück zum Hauptthema',
    'Layout',
    'Farbschema',
    'Vollbild umschalten',
  ]);
  expect(input.getAttribute('aria-label')).toBe('Zoomstufe');
  expect(input.value).toBe('100 %');
  controls.setZoom(1.5);
  expect(input.value).toBe('150 %');
  type(input, '87,5 %');
  press(input, 'Enter');
  expect(actions.zoomTo).toHaveBeenCalledExactlyOnceWith(0.875);
  expect(input.value).toBe('88 %');
  buttons[1]?.click();
  expect(titles(Menu.lastShown)).toEqual([
    '50 %',
    '75 %',
    '100 %',
    '125 %',
    '150 %',
    '200 %',
    null,
    'An Ansicht anpassen',
  ]);
  controls.setCollapsed(true);
  expect(buttons[4]?.getAttribute('aria-label')).toBe('Alle ausklappen');
  controls.setLayout('left-to-right', false);
  buttons[6]?.click();
  expect(titles(Menu.lastShown)).toEqual([
    'Ausgewogen im Uhrzeigersinn',
    'Ausgewogen gegen den Uhrzeigersinn',
    'Links → rechts',
    'Rechts → links',
    'Oben → unten',
    'Unten → oben',
    null,
    'Layout der Notiz verwenden',
  ]);
  controls.setTheme('rainbow', false);
  buttons[7]?.click();
  expect(titles(Menu.lastShown)).toEqual([
    'Keins',
    'Regenbogen',
    'Ozean',
    'Wald',
    'Akzentfarbe',
    null,
    'Farbschema der Notiz verwenden',
  ]);
});

const LAYOUT_TITLES = [
  'Balanced clockwise',
  'Balanced counter-clockwise',
  'Left → right',
  'Right → left',
  'Top → bottom',
  'Bottom → top',
];

test('the layout button opens a menu of the six layouts, the current one checked, then "Use the note\'s layout"', () => {
  const { parent, actions, controls, buttons } = setup();
  controls.setLayout('top-to-bottom', false);
  buttons[6]?.click();
  const menu = Menu.lastShown;
  expect(titles(menu)).toEqual([...LAYOUT_TITLES, null, "Use the note's layout"]);
  expect(checked(menu)).toEqual(['Top → bottom']);
  // The button's document: popout windows get the menu in their own window.
  expect(menu?.shownAt?.doc).toBe(parent.ownerDocument);

  void item(menu, 'Right → left')?.clickHandler?.();
  expect(actions.chooseLayout).toHaveBeenLastCalledWith('right-to-left');
  void item(menu, "Use the note's layout")?.clickHandler?.();
  expect(actions.chooseLayout).toHaveBeenLastCalledWith(null);
  expect(actions.chooseLayout).toHaveBeenCalledTimes(2);
});

test('the theme button opens a menu of the five themes, the current one checked, then "Use the note\'s theme"', () => {
  const { parent, actions, controls, buttons } = setup();
  controls.setTheme('ocean', true);
  buttons[7]?.click();
  const menu = Menu.lastShown;
  expect(titles(menu)).toEqual([
    'None',
    'Rainbow',
    'Ocean',
    'Forest',
    'Accent colour',
    null,
    "Use the note's theme",
  ]);
  expect(checked(menu)).toEqual(['Ocean']);
  expect(menu?.shownAt?.doc).toBe(parent.ownerDocument);

  void item(menu, 'Accent colour')?.clickHandler?.();
  expect(actions.chooseTheme).toHaveBeenLastCalledWith('accent');
  void item(menu, "Use the note's theme")?.clickHandler?.();
  expect(actions.chooseTheme).toHaveBeenLastCalledWith(null);
});

test('the layout and theme buttons are highlighted while their override is active', () => {
  const { controls, buttons } = setup();
  const [layout, theme] = [buttons[6], buttons[7]];
  expect(layout?.classList.contains('is-active')).toBe(false);
  expect(theme?.classList.contains('is-active')).toBe(false);
  controls.setLayout('left-to-right', true);
  expect(layout?.classList.contains('is-active')).toBe(true);
  expect(theme?.classList.contains('is-active')).toBe(false);
  controls.setTheme('forest', true);
  expect(theme?.classList.contains('is-active')).toBe(true);
  controls.setLayout('left-to-right', false);
  controls.setTheme('forest', false);
  expect(layout?.classList.contains('is-active')).toBe(false);
  expect(theme?.classList.contains('is-active')).toBe(false);
});

test('the menus can be opened without a click (commands), at their buttons', () => {
  const { controls, buttons } = setup();
  controls.setLayout('left-to-right', false);
  controls.setTheme('none', false);
  controls.showLayoutMenu();
  expect(checked(Menu.lastShown)).toEqual(['Left → right']);
  controls.showThemeMenu();
  expect(checked(Menu.lastShown)).toEqual(['None']);
  expect(buttons.length).toBe(9);
});
