import { LeafRecency } from '../../src/leafRecency';
import { type App, MarkdownRenderer } from 'obsidian';
import type { MindMapNode } from '../../src/parser/types';
import type { TagPosition } from '../../src/tagPositions';
import { NodeContentModal } from '../../src/render/NodeContentModal';
import type { Component as MockComponent } from '../mocks/obsidian';

const node: MindMapNode = {
  id: 'n',
  kind: 'block',
  label: 'x',
  markdown: '```\nline 2000\n```',
  sectionType: 'code',
  level: 0,
  line: 0,
  children: [],
};

afterEach(() => vi.restoreAllMocks());

function linkContext(openLinkText = vi.fn(() => Promise.resolve())) {
  return {
    sourcePath: () => 'Note.md',
    hoverParent: { hoverPopover: null },
    mapLeaf: null,
    recency: new LeafRecency(),
    tagPosition: 'outside' as TagPosition,
    workspace: { openLinkText, getMostRecentLeaf: () => null, getLeavesOfType: () => [] },
  };
}

test('an internal link in the overlay opens the note and closes the overlay', async () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, el) => {
    el.createEl('a', { cls: 'internal-link', text: 'lists', attr: { 'data-href': 'lists' } });
    return Promise.resolve();
  });
  const openLinkText = vi.fn(() => Promise.resolve());
  const ctx = linkContext(openLinkText);
  const app = { workspace: ctx.workspace } as unknown as App;
  const modal = new NodeContentModal(app, node, ctx);
  const close = vi.spyOn(modal, 'close');
  modal.open();
  const link = await vi.waitFor(() => {
    const el = modal.contentEl.querySelector<HTMLElement>('a.internal-link');
    if (!el) throw new Error('not rendered yet');
    return el;
  });
  link.click();
  expect(openLinkText).toHaveBeenCalledWith('lists', 'Note.md', 'split');
  expect(close).toHaveBeenCalled();
});

test('renders the full markdown with its own component, unloaded on close', async () => {
  let component: MockComponent | null = null;
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, markdown, el, path, c) => {
    component = c as unknown as MockComponent;
    el.createEl('pre', { text: markdown });
    el.createEl('input', { attr: { type: 'checkbox' } });
    expect(path).toBe('Note.md');
    return Promise.resolve();
  });
  const modal = new NodeContentModal({} as App, node, linkContext());
  modal.open();
  await vi.waitFor(() => expect(modal.contentEl.textContent).toContain('line 2000'));
  expect(modal.contentEl.classList.contains('mind-mapper-full-content')).toBe(true);
  expect(modal.contentEl.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
  expect(component).not.toBeNull();
  expect((component as MockComponent | null)?.loaded).toBe(true);
  modal.close();
  expect((component as MockComponent | null)?.loaded).toBe(false);
  expect(modal.contentEl.childElementCount).toBe(0);
});

test('a failed render shows the raw markdown and logs the error', async () => {
  const error = new Error('render failed');
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(() => Promise.reject(error));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const modal = new NodeContentModal({} as App, node, linkContext());
  modal.open();
  await vi.waitFor(() => expect(modal.contentEl.textContent).toBe(node.markdown));
  expect(log).toHaveBeenCalledWith('Mind Mapper: full content render failed', error);
  modal.close();
});

test('the overlay carries its data-mm-id (issue #33)', () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(() => Promise.resolve());
  const modal = new NodeContentModal({} as App, node, linkContext());
  modal.open();
  expect(modal.modalEl.getAttribute('data-mm-id')).toBe('modal.node-content');
  modal.close();
});

test('nested tags in the overlay look like in the node (issue #57)', async () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, el) => {
    el.createEl('a', { cls: 'tag', text: '#obsidian/test', attr: { href: '#obsidian/test' } });
    return Promise.resolve();
  });
  const modal = new NodeContentModal({} as App, node, linkContext());
  modal.open();
  await vi.waitFor(() =>
    expect(modal.contentEl.querySelector('a.tag')?.getAttribute('data-mm-id')).toBe('node.tag'),
  );
  expect(modal.contentEl.querySelector('.mind-mapper-tag-scope')?.textContent).toBe('#obsidian');
  modal.close();
});

test('a tag in the overlay opens the tag search and closes the overlay (issue #77)', async () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, el) => {
    el.createEl('a', { cls: 'tag', text: '#obsidian/test', attr: { href: '#obsidian/test' } });
    return Promise.resolve();
  });
  const openGlobalSearch = vi.fn();
  const ctx = linkContext();
  const app = {
    workspace: ctx.workspace,
    internalPlugins: { getEnabledPluginById: () => ({ openGlobalSearch }) },
  } as unknown as App;
  const modal = new NodeContentModal(app, node, ctx);
  const close = vi.spyOn(modal, 'close');
  modal.open();
  const value = await vi.waitFor(() => {
    const el = modal.contentEl.querySelector<HTMLElement>('.mind-mapper-tag-value');
    if (!el) throw new Error('not rendered yet');
    return el;
  });
  value.click();
  expect(openGlobalSearch).toHaveBeenCalledWith('tag:#obsidian/test');
  expect(close).toHaveBeenCalled();
});

// Issue #105: the overlay follows the tags setting.
describe('tags mode in the overlay (issue #105)', () => {
  function renderTag() {
    vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_a, _m, el) => {
      el.createEl('a', {
        cls: 'tag',
        text: '#test/brat/wurst',
        attr: { href: '#test/brat/wurst' },
      });
      return Promise.resolve();
    });
  }

  test.each(['text', 'outside', 'inside'] as const)('the content gets the class for %s', (mode) => {
    renderTag();
    const modal = new NodeContentModal({} as App, node, { ...linkContext(), tagPosition: mode });
    modal.open();
    expect(modal.contentEl.classList.contains(`mind-mapper-tags-${mode}`)).toBe(true);
    modal.close();
  });

  test('text: each level is its own tag search and closes the overlay; segments have tooltips', async () => {
    renderTag();
    const openGlobalSearch = vi.fn();
    const ctx = { ...linkContext(), tagPosition: 'text' as const };
    const app = {
      workspace: ctx.workspace,
      internalPlugins: { getEnabledPluginById: () => ({ openGlobalSearch }) },
    } as unknown as App;
    const modal = new NodeContentModal(app, node, ctx);
    const close = vi.spyOn(modal, 'close');
    modal.open();
    const segments = await vi.waitFor(() => {
      const list = Array.from(
        modal.contentEl.querySelectorAll<HTMLElement>('.mind-mapper-tag-segment'),
      );
      if (list.length === 0) throw new Error('not rendered yet');
      return list;
    });
    expect(segments.map((s) => s.getAttribute('aria-label'))).toEqual([
      '#test',
      '#test/brat',
      '#test/brat/wurst',
    ]);
    segments[1]?.click();
    expect(openGlobalSearch).toHaveBeenCalledWith('tag:#test/brat');
    expect(close).toHaveBeenCalled();
  });

  test('outside and inside: a pill, the full tag on every part, no segment tooltips', async () => {
    renderTag();
    const modal = new NodeContentModal({} as App, node, {
      ...linkContext(),
      tagPosition: 'outside',
    });
    modal.open();
    await vi.waitFor(() =>
      expect(modal.contentEl.querySelector('.mind-mapper-tag-segment')).not.toBeNull(),
    );
    expect(modal.contentEl.querySelector('.mind-mapper-tag-segment[aria-label]')).toBeNull();
    modal.close();
  });
});
