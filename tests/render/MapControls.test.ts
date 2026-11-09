import { MapControls } from '../../src/render/MapControls';
import { useGerman } from '../helpers';

function setup() {
  const parent = document.createElement('div');
  const actions = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitToView: vi.fn(),
    resetZoom: vi.fn(),
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
    backToRoot: vi.fn(),
    toggleFullScreen: vi.fn(),
  };
  const controls = new MapControls(parent, actions);
  const buttons = [...parent.querySelectorAll<HTMLElement>('.mind-mapper-controls button')];
  return { actions, controls, buttons };
}

test('renders seven buttons in order with aria labels', () => {
  const { buttons } = setup();
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Zoom out',
    'Reset zoom to 100%',
    'Zoom in',
    'Fit to view',
    'Collapse all',
    'Back to root',
    'Toggle full screen',
  ]);
  expect(buttons.map((b) => b.dataset.icon)).toEqual([
    'zoom-out',
    undefined,
    'zoom-in',
    'maximize',
    'chevrons-down-up',
    'locate',
    'maximize-2',
  ]);
});

test('each button calls its action once', () => {
  const { actions, buttons } = setup();
  buttons.forEach((b) => b.click());
  expect(actions.expandAll).not.toHaveBeenCalled();
  expect(actions.zoomOut).toHaveBeenCalledTimes(1);
  expect(actions.resetZoom).toHaveBeenCalledTimes(1);
  expect(actions.zoomIn).toHaveBeenCalledTimes(1);
  expect(actions.fitToView).toHaveBeenCalledTimes(1);
  expect(actions.collapseAll).toHaveBeenCalledTimes(1);
  expect(actions.backToRoot).toHaveBeenCalledTimes(1);
  expect(actions.toggleFullScreen).toHaveBeenCalledTimes(1);
});

test('reset button shows the zoom percentage', () => {
  const { controls, buttons } = setup();
  expect(buttons[1]?.textContent).toBe('100%');
  controls.setZoom(0.5);
  expect(buttons[1]?.textContent).toBe('50%');
  controls.setZoom(1.234);
  expect(buttons[1]?.textContent).toBe('123%');
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

test('in German the labels, the collapse state and the zoom percentage are German', () => {
  useGerman();
  const { controls, buttons } = setup();
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Verkleinern',
    'Vergrößerung auf 100 % zurücksetzen',
    'Vergrößern',
    'An Ansicht anpassen',
    'Alle einklappen',
    'Zurück zum Hauptthema',
    'Vollbild umschalten',
  ]);
  expect(buttons[1]?.textContent).toBe('100\u00a0%');
  controls.setZoom(1.5);
  expect(buttons[1]?.textContent).toBe('150\u00a0%');
  controls.setCollapsed(true);
  expect(buttons[4]?.getAttribute('aria-label')).toBe('Alle ausklappen');
});
