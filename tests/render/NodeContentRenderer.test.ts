import { type App, Component, MarkdownRenderer } from 'obsidian';
import type { MindMapNode } from '../../src/parser/types';
import { NodeContentRenderer, RENDER_TIMEOUT_MS } from '../../src/render/NodeContentRenderer';
import type { Component as MockComponent } from '../mocks/obsidian';

function node(markdown: string): MindMapNode {
  return {
    id: 'n',
    kind: 'paragraph',
    label: markdown,
    markdown,
    sectionType: null,
    level: 0,
    line: 0,
    children: [],
  };
}

function setup() {
  const parent = new Component();
  parent.load();
  const renderer = new NodeContentRenderer({} as App, () => 'Note.md', parent);
  const nodeEl = document.createElement('div');
  const contentEl = nodeEl.createDiv({ cls: 'mind-mapper-node-content' });
  document.body.appendChild(nodeEl);
  return { parent, renderer, nodeEl, contentEl };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('renders the markdown with Obsidian into the content element', async () => {
  const spy = vi.spyOn(MarkdownRenderer, 'render');
  const { renderer, contentEl } = setup();
  await renderer.render(node('**hi**'), contentEl);
  expect(spy).toHaveBeenCalledWith({}, '**hi**', contentEl, 'Note.md', expect.any(Component));
  expect(contentEl.textContent).toBe('**hi**');
});

test('each node gets its own child component; releaseAll unloads all', async () => {
  const components: MockComponent[] = [];
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, _el, _p, component) => {
    components.push(component as unknown as MockComponent);
    return Promise.resolve();
  });
  const { renderer, contentEl, nodeEl } = setup();
  const other = nodeEl.createDiv();
  await renderer.render(node('a'), contentEl);
  await renderer.render(node('b'), other);
  expect(components).toHaveLength(2);
  expect(components[0]).not.toBe(components[1]);
  expect(components.every((c) => c.loaded)).toBe(true);
  renderer.releaseAll();
  expect(components.some((c) => c.loaded)).toBe(false);
});

test('release unloads only that node', async () => {
  const components: MockComponent[] = [];
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, _el, _p, component) => {
    components.push(component as unknown as MockComponent);
    return Promise.resolve();
  });
  const { renderer, contentEl, nodeEl } = setup();
  const other = nodeEl.createDiv();
  await renderer.render(node('a'), contentEl);
  await renderer.render(node('b'), other);
  renderer.release(contentEl);
  expect(components.map((c) => c.loaded)).toEqual([false, true]);
});

test('a throwing render falls back to raw text with an error marker', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(MarkdownRenderer, 'render').mockRejectedValue(new Error('boom'));
  const { renderer, contentEl, nodeEl } = setup();
  await renderer.render(node('raw *md*'), contentEl);
  expect(contentEl.textContent).toBe('raw *md*');
  expect(nodeEl.classList.contains('is-render-error')).toBe(true);
});

test('a hanging render falls back after the timeout', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.spyOn(MarkdownRenderer, 'render').mockReturnValue(new Promise(() => {}));
  const { renderer, contentEl, nodeEl } = setup();
  const done = renderer.render(node('slow'), contentEl);
  await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS);
  await done;
  expect(RENDER_TIMEOUT_MS).toBe(5000);
  expect(contentEl.textContent).toBe('slow');
  expect(nodeEl.classList.contains('is-render-error')).toBe(true);
});

test('output of a timed-out render that finishes late is replaced by the fallback again', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  // Like a slow post processor in real Obsidian: it writes into the container, then the render ends.
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(
    (_app, _markdown, el) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          el.createEl('span', { text: 'late' });
          resolve();
        }, RENDER_TIMEOUT_MS + 1000);
      }),
  );
  const { renderer, contentEl, nodeEl } = setup();
  const done = renderer.render(node('slow'), contentEl);
  await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS);
  await done;
  expect(contentEl.textContent).toBe('slow');
  await vi.advanceTimersByTimeAsync(1000);
  expect(contentEl.textContent).toBe('slow');
  expect(contentEl.querySelector('span')).toBeNull();
  expect(nodeEl.classList.contains('is-render-error')).toBe(true);
});

test('a timed-out render finishing after release writes nothing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  let resolve = (): void => {};
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const { renderer, contentEl } = setup();
  const done = renderer.render(node('slow'), contentEl);
  await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS);
  await done;
  renderer.release(contentEl);
  contentEl.setText('reused');
  resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(contentEl.textContent).toBe('reused');
});

test('a render finishing after release writes nothing', async () => {
  let resolve = (): void => {};
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const { renderer, contentEl, nodeEl } = setup();
  contentEl.createEl('input', { attr: { type: 'checkbox' } });
  const done = renderer.render(node('x'), contentEl);
  renderer.release(contentEl);
  resolve();
  await done;
  expect(contentEl.querySelector('input')?.disabled).toBe(false);
  expect(nodeEl.classList.contains('is-render-error')).toBe(false);
});

test('a failing render after release does not fall back', async () => {
  let reject = (_e: Error): void => {};
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(
    () =>
      new Promise<void>((_r, j) => {
        reject = j;
      }),
  );
  const { renderer, contentEl, nodeEl } = setup();
  const done = renderer.render(node('x'), contentEl);
  renderer.release(contentEl);
  reject(new Error('late'));
  await done;
  expect(nodeEl.classList.contains('is-render-error')).toBe(false);
});

test('checkboxes are disabled after rendering', async () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, el) => {
    el.createEl('ul')
      .createEl('li')
      .createEl('input', { cls: 'task-list-item-checkbox', attr: { type: 'checkbox' } });
    return Promise.resolve();
  });
  const { renderer, contentEl } = setup();
  await renderer.render(node('- [ ] a'), contentEl);
  expect(contentEl.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
});

test('release clears the pending render timeout', () => {
  vi.useFakeTimers();
  vi.spyOn(MarkdownRenderer, 'render').mockReturnValue(new Promise<void>(() => {}));
  const { renderer, contentEl } = setup();
  void renderer.render(node('slow'), contentEl);
  expect(vi.getTimerCount()).toBe(1);
  renderer.release(contentEl);
  expect(vi.getTimerCount()).toBe(0);
});
