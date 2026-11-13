import { Component, type ItemView, type WorkspaceLeaf } from 'obsidian';
import { attachLinkHandling, HOVER_SOURCE_ID } from '../../src/render/linkHandling';
import { LeafRecency } from '../../src/leafRecency';

interface FakeLeaf {
  view: { getViewType(): string };
}

function setup(
  leaves: FakeLeaf[] = [],
  mostRecent: FakeLeaf | null = null,
  internalPlugins?: unknown,
) {
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
    app: { workspace, internalPlugins },
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
  const onNavigate = vi.fn();
  attachLinkHandling(canvas, {
    app: view.app,
    events: component,
    hoverParent: { hoverPopover: null },
    mapLeaf: view.leaf,
    recency,
    sourcePath: () => 'fixtures/embeds.md',
    onNavigate,
  });
  return {
    workspace,
    view,
    canvas,
    nodeEl,
    internal,
    external,
    nodeClicks,
    mapLeaf,
    recency,
    onNavigate,
  };
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

test('middle click on an internal link opens it in a new tab, like reading view', () => {
  const { workspace, internal, nodeClicks } = setup([markdownLeaf()]);
  const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
  internal.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(nodeClicks).not.toHaveBeenCalled();
  expect(workspace.openLinkText).toHaveBeenCalledWith('lists', 'fixtures/embeds.md', 'tab');
  expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
});

test('other auxiliary buttons (right click) on a link are left to Obsidian', () => {
  const { workspace, internal } = setup([markdownLeaf()]);
  const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 });
  internal.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(workspace.openLinkText).not.toHaveBeenCalled();
});

test('external links are left to Obsidian (default action, other listeners run)', () => {
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

/** Obsidian's private plugin registry with the search core plugin enabled (issue #77). */
function searchPlugin() {
  const openGlobalSearch = vi.fn();
  const getEnabledPluginById = vi.fn((id: string) =>
    id === 'global-search' ? { openGlobalSearch } : null,
  );
  return { internalPlugins: { getEnabledPluginById }, openGlobalSearch };
}

function addTag(nodeEl: HTMLElement, tag: string): HTMLElement {
  return nodeEl.createEl('a', { cls: 'tag', text: tag, attr: { href: tag } });
}

/** A nested-tag pill as `splitNestedTags` builds it (issue #57). */
function addNestedTag(nodeEl: HTMLElement): HTMLElement {
  const a = nodeEl.createEl('a', {
    cls: 'tag mind-mapper-tag',
    attr: { href: '#obsidian/test', 'aria-label': '#obsidian/test' },
  });
  a.createSpan({ cls: 'mind-mapper-tag-scope', text: '#obsidian' });
  a.createSpan({ cls: 'mind-mapper-tag-separator', text: '/' });
  a.createSpan({ cls: 'mind-mapper-tag-value', text: 'test' });
  return a;
}

describe('tag click opens the tag search (issue #77)', () => {
  test('a click on a tag opens the search with the tag query, like reading view', () => {
    const { internalPlugins, openGlobalSearch } = searchPlugin();
    const { workspace, nodeEl, nodeClicks, onNavigate } = setup(
      [markdownLeaf()],
      null,
      internalPlugins,
    );
    const event = click(addTag(nodeEl, '#solo'));
    expect(openGlobalSearch).toHaveBeenCalledWith('tag:#solo');
    expect(event.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    // the click propagates as before (the renderer ignores clicks on links: selection unchanged);
    // no other link handling
    expect(nodeClicks).toHaveBeenCalledTimes(1);
    expect(workspace.openLinkText).not.toHaveBeenCalled();
    expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
  });

  test('a click on either part of a nested-tag pill searches the full tag', () => {
    const { internalPlugins, openGlobalSearch } = searchPlugin();
    const { nodeEl } = setup([], null, internalPlugins);
    const pill = addNestedTag(nodeEl);
    click(pill.querySelector<HTMLElement>('.mind-mapper-tag-value') as HTMLElement);
    click(pill.querySelector<HTMLElement>('.mind-mapper-tag-scope') as HTMLElement);
    expect(openGlobalSearch.mock.calls).toEqual([['tag:#obsidian/test'], ['tag:#obsidian/test']]);
  });

  test('Ctrl/Cmd click on a tag does the same as a plain click (reading view)', () => {
    const { internalPlugins, openGlobalSearch } = searchPlugin();
    const { workspace, nodeEl } = setup([markdownLeaf()], null, internalPlugins);
    click(addTag(nodeEl, '#solo'), { ctrlKey: true, metaKey: true });
    expect(openGlobalSearch).toHaveBeenCalledWith('tag:#solo');
    expect(workspace.openLinkText).not.toHaveBeenCalled();
  });

  test('middle click on a tag does nothing, like reading view', () => {
    const { internalPlugins, openGlobalSearch } = searchPlugin();
    const { workspace, nodeEl, onNavigate } = setup([markdownLeaf()], null, internalPlugins);
    const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    addTag(nodeEl, '#solo').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(openGlobalSearch).not.toHaveBeenCalled();
    expect(workspace.openLinkText).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test.each([
    ['the private API is missing', undefined],
    ['the API has no getEnabledPluginById', {}],
    ['the search core plugin is disabled', { getEnabledPluginById: () => null }],
    ['the search plugin has no openGlobalSearch', { getEnabledPluginById: () => ({}) }],
  ])('nothing happens and nothing throws when %s', (_name, internalPlugins) => {
    const { workspace, nodeEl, nodeClicks, onNavigate } = setup([], null, internalPlugins);
    const event = click(addTag(nodeEl, '#solo'));
    expect(event.defaultPrevented).toBe(false);
    expect(nodeClicks).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(workspace.openLinkText).not.toHaveBeenCalled();
  });

  test('hovering a tag does not trigger a page preview', () => {
    const { internalPlugins } = searchPlugin();
    const { workspace, nodeEl } = setup([], null, internalPlugins);
    addTag(nodeEl, '#solo').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(workspace.trigger).not.toHaveBeenCalled();
  });
});
