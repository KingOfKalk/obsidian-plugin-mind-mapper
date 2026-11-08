import { FullScreen } from '../../src/view/fullScreen';

function setup() {
  const leafEl = document.body.createDiv({ cls: 'workspace-leaf-content' });
  leafEl.createDiv({ cls: 'view-header' });
  const contentEl = leafEl.createDiv({ cls: 'view-content' });
  const after = leafEl.createDiv({ cls: 'after' });
  const onExit = vi.fn();
  const fullScreen = new FullScreen({ contentEl, title: () => 'My note', onExit });
  return { leafEl, contentEl, after, onExit, fullScreen };
}

afterEach(() => {
  document.body.empty();
  vi.useRealTimers();
});

test('full screen moves the map into a body overlay and back to the same place', () => {
  const { leafEl, contentEl, after, fullScreen } = setup();
  fullScreen.enter();
  expect(fullScreen.active).toBe(true);
  const overlay = document.body.querySelector('.mind-mapper-full-screen');
  expect(overlay?.parentElement).toBe(document.body);
  expect(contentEl.parentElement).toBe(overlay);
  expect(overlay?.querySelector('.mind-mapper-title-chip')?.textContent).toBe('My note');
  fullScreen.exit();
  expect(fullScreen.active).toBe(false);
  expect(document.body.querySelector('.mind-mapper-full-screen')).toBeNull();
  expect(contentEl.parentElement).toBe(leafEl);
  expect(contentEl.nextSibling).toBe(after);
});

test('the exit button calls onExit', () => {
  const { fullScreen, onExit } = setup();
  fullScreen.enter();
  const button = document.body.querySelector<HTMLElement>(
    '.mind-mapper-full-screen [aria-label="Exit full screen"]',
  );
  button?.click();
  expect(onExit).toHaveBeenCalledTimes(1);
});

test('controls fade after 2 s idle and come back on mouse move', () => {
  vi.useFakeTimers();
  const { fullScreen } = setup();
  fullScreen.enter();
  const overlay = document.body.querySelector<HTMLElement>('.mind-mapper-full-screen');
  vi.advanceTimersByTime(1999);
  expect(overlay?.classList.contains('is-idle')).toBe(false);
  vi.advanceTimersByTime(1);
  expect(overlay?.classList.contains('is-idle')).toBe(true);
  overlay?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  expect(overlay?.classList.contains('is-idle')).toBe(false);
  vi.advanceTimersByTime(2000);
  expect(overlay?.classList.contains('is-idle')).toBe(true);
  fullScreen.exit();
  expect(vi.getTimerCount()).toBe(0);
});

test('enter twice does not nest overlays; exit when inactive is a no-op', () => {
  const { fullScreen } = setup();
  fullScreen.exit();
  fullScreen.enter();
  fullScreen.enter();
  expect(document.body.querySelectorAll('.mind-mapper-full-screen')).toHaveLength(1);
});
