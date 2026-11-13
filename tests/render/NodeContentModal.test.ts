import { LeafRecency } from '../../src/leafRecency';
import { type App, MarkdownRenderer } from 'obsidian';
import type { MindMapNode } from '../../src/parser/types';
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

test('the overlay carries its data-mm-id (issue #33)', () => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation(() => Promise.resolve());
  const modal = new NodeContentModal({} as App, node, linkContext());
  modal.open();
  expect(modal.modalEl.getAttribute('data-mm-id')).toBe('modal.node-content');
  modal.close();
});
