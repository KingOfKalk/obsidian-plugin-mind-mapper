import { Component, type ItemView, type WorkspaceLeaf } from 'obsidian';
import { attachLinkHandling, HOVER_SOURCE_ID } from '../../src/render/linkHandling';
import { LeafRecency } from '../../src/leafRecency';

interface FakeLeaf {
  view: { getViewType(): string };
}

function setup(leaves: FakeLeaf[] = [], mostRecent: FakeLeaf | null = null) {
  const workspace = {
    openLinkText: vi.fn(() => Promise.resolve()),
    trigger: vi.fn(),
    setActiveLeaf: vi.fn(),
    getLeavesOfType: vi.fn((type: string) => leaves.filter((l) => l.view.getViewType() === type)),
  };
  const recency = new LeafRecency();
  if (mostRecent) recency.touch(mostRecent as unknown as WorkspaceLeaf);
  const component = new Component();
  const mapLeaf = { view: { getViewType: () => 'mind-mapper-view' } };
  const view = Object.assign(component, {
    app: { workspace },
    leaf: mapLeaf as unknown as WorkspaceLeaf,
  }) as unknown as ItemView;
  const canvas = document.createElement('div');
  const nodeEl = canvas.createDiv({ cls: 'mind-mapper-node' });
  const internal = nodeEl.createEl('a', {
    cls: 'internal-link',
    text: 'lists',
    attr: { 'data-href': 'lists', href: 'lists' },
  });
  const external = nodeEl.createEl('a', {
    cls: 'external-link',
    text: 'ext',
    attr: { href: 'https://example.com' },
  });
  document.body.appendChild(canvas);
  const nodeClicks = vi.fn();
  nodeEl.addEventListener('click', nodeClicks);
  attachLinkHandling(canvas, {
    app: view.app,
    events: component,
    hoverParent: { hoverPopover: null },
    mapLeaf: view.leaf,
    recency,
    sourcePath: () => 'fixtures/embeds.md',
  });
  return { workspace, view, canvas, internal, external, nodeClicks, mapLeaf, recency };
}

const markdownLeaf = (): FakeLeaf => ({ view: { getViewType: () => 'markdown' } });

function click(el: HTMLElement, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

test('plain click on an internal link opens it in the most recent note leaf, not the map', () => {
  const note = markdownLeaf();
  const { workspace, internal, nodeClicks } = setup([note], note);
  const event = click(internal);
  expect(event.defaultPrevented).toBe(true);
  expect(nodeClicks).not.toHaveBeenCalled();
  expect(workspace.setActiveLeaf).toHaveBeenCalledWith(note, { focus: true });
  expect(workspace.openLinkText).toHaveBeenCalledWith('lists', 'fixtures/embeds.md', false);
});

test('if the most recent leaf is the map, another note leaf is used', () => {
  const note = markdownLeaf();
  const { workspace, internal, mapLeaf, recency } = setup([note], null);
  recency.touch(mapLeaf as unknown as WorkspaceLeaf);
  click(internal);
  expect(workspace.setActiveLeaf).toHaveBeenCalledWith(note, { focus: true });
});

test('link click opens in the most recently active note leaf', () => {
  const first = markdownLeaf();
  const second = markdownLeaf();
  const { workspace, internal, recency } = setup([first, second], null);
  recency.touch(second as unknown as WorkspaceLeaf);
  recency.touch(first as unknown as WorkspaceLeaf);
  click(internal);
  expect(workspace.setActiveLeaf).toHaveBeenCalledWith(first, { focus: true });
});

test('without any note leaf the link opens in a split', () => {
  const { workspace, internal } = setup([], null);
  click(internal);
  expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  expect(workspace.openLinkText).toHaveBeenCalledWith('lists', 'fixtures/embeds.md', 'split');
});

test('Ctrl/Cmd click passes the Keymap mod result (new tab)', () => {
  const { workspace, internal } = setup([markdownLeaf()]);
  click(internal, { ctrlKey: true });
  expect(workspace.openLinkText).toHaveBeenCalledWith('lists', 'fixtures/embeds.md', 'tab');
  expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
});

test('external links and tags are left to Obsidian (default action, other listeners run)', () => {
  const { workspace, external, nodeClicks } = setup();
  const event = click(external);
  expect(event.defaultPrevented).toBe(false);
  expect(nodeClicks).toHaveBeenCalledTimes(1);
  expect(workspace.openLinkText).not.toHaveBeenCalled();
});

test('a tag link keeps its own click listener', () => {
  const { external } = setup();
  const tag = external.parentElement?.createEl('a', {
    cls: 'tag',
    text: '#x',
    attr: { href: '#x' },
  });
  const tagClicks = vi.fn();
  tag?.addEventListener('click', tagClicks);
  if (tag) click(tag);
  expect(tagClicks).toHaveBeenCalledTimes(1);
});

test('onNavigate runs after an internal link opens (e.g. to close the overlay)', () => {
  const note = markdownLeaf();
  const { workspace, internal, view, recency } = setup([note], note);
  const canvas2 = document.createElement('div');
  const link = canvas2.createEl('a', {
    cls: 'internal-link',
    attr: { 'data-href': 'lists', href: 'lists' },
  });
  document.body.appendChild(canvas2);
  const onNavigate = vi.fn();
  attachLinkHandling(canvas2, {
    app: view.app,
    events: view,
    hoverParent: { hoverPopover: null },
    mapLeaf: view.leaf,
    recency,
    sourcePath: () => 'Note.md',
    onNavigate,
  });
  click(link);
  expect(workspace.openLinkText).toHaveBeenCalledWith('lists', 'Note.md', false);
  expect(onNavigate).toHaveBeenCalledTimes(1);
  void internal;
});

test('hovering an internal link triggers hover-link for page preview', () => {
  const { workspace, internal } = setup();
  const event = new MouseEvent('mouseover', { bubbles: true });
  internal.dispatchEvent(event);
  expect(workspace.trigger).toHaveBeenCalledWith('hover-link', {
    event,
    source: HOVER_SOURCE_ID,
    hoverParent: { hoverPopover: null },
    targetEl: internal,
    linktext: 'lists',
    sourcePath: 'fixtures/embeds.md',
  });
});

test('hovering an external link does nothing', () => {
  const { workspace, external } = setup();
  external.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  expect(workspace.trigger).not.toHaveBeenCalled();
});
