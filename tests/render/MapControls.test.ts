import { MapControls } from '../../src/render/MapControls';

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

test('renders eight buttons in order with aria labels', () => {
  const { buttons } = setup();
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'Zoom out',
    'Reset zoom to 100%',
    'Zoom in',
    'Fit to view',
    'Collapse all',
    'Expand all',
    'Back to root',
    'Toggle full screen',
  ]);
  expect(buttons.map((b) => b.dataset.icon)).toEqual([
    'zoom-out',
    undefined,
    'zoom-in',
    'maximize',
    'chevrons-down-up',
    'chevrons-up-down',
    'locate',
    'maximize-2',
  ]);
});

test('each button calls its action once', () => {
  const { actions, buttons } = setup();
  buttons.forEach((b) => b.click());
  expect(actions.zoomOut).toHaveBeenCalledTimes(1);
  expect(actions.resetZoom).toHaveBeenCalledTimes(1);
  expect(actions.zoomIn).toHaveBeenCalledTimes(1);
  expect(actions.fitToView).toHaveBeenCalledTimes(1);
  expect(actions.collapseAll).toHaveBeenCalledTimes(1);
  expect(actions.expandAll).toHaveBeenCalledTimes(1);
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
