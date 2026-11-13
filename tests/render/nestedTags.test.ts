import {
  markTrailingTags,
  splitNestedTags,
  splitTag,
  TRAILING_TAGS_CLASS,
} from '../../src/render/nestedTags';

describe('splitTag', () => {
  test('splits at the last slash: scope keeps the #, value is the last segment', () => {
    expect(splitTag('#obsidian/test')).toEqual({ scope: '#obsidian', value: 'test' });
    expect(splitTag('#project/alpha/backend')).toEqual({
      scope: '#project/alpha',
      value: 'backend',
    });
  });

  test('a plain tag is not split', () => {
    expect(splitTag('#solo')).toBeNull();
  });

  test('no empty part: a leading or trailing slash is not split', () => {
    expect(splitTag('#a/')).toBeNull();
    expect(splitTag('#/a')).toBeNull();
  });
});

/** A tag as Obsidian renders it. */
function tag(parent: HTMLElement, href: string): HTMLElement {
  return parent.createEl('a', {
    cls: 'tag',
    text: href,
    attr: { href, target: '_blank', rel: 'noopener nofollow' },
  });
}

describe('splitNestedTags', () => {
  test('a nested tag becomes scope + value with its full text as label and node.tag ID', () => {
    const el = document.createElement('div');
    const p = el.createEl('p', { text: 'Hi ' });
    tag(p, '#obsidian/test');
    p.append(' there');
    splitNestedTags(el);
    const a = el.querySelector('a.tag');
    expect(a?.getAttribute('data-mm-id')).toBe('node.tag');
    expect(a?.getAttribute('aria-label')).toBe('#obsidian/test');
    expect(a?.getAttribute('href')).toBe('#obsidian/test');
    expect(a?.querySelector('.mind-mapper-tag-scope')?.textContent).toBe('#obsidian');
    expect(a?.querySelector('.mind-mapper-tag-value')?.textContent).toBe('test');
    // The slash stays in the text (hidden by styles.css): copying gives the full tag.
    expect(a?.textContent).toBe('#obsidian/test');
    expect(el.textContent).toBe('Hi #obsidian/test there');
  });

  test('three levels split at the last slash', () => {
    const el = document.createElement('div');
    tag(el, '#project/alpha/backend');
    splitNestedTags(el);
    expect(el.querySelector('.mind-mapper-tag-scope')?.textContent).toBe('#project/alpha');
    expect(el.querySelector('.mind-mapper-tag-value')?.textContent).toBe('backend');
  });

  test('plain tags and other links are left alone', () => {
    const el = document.createElement('div');
    tag(el, '#solo');
    el.createEl('a', { cls: 'internal-link', text: 'a/b', attr: { href: 'a/b' } });
    const before = el.innerHTML;
    splitNestedTags(el);
    expect(el.innerHTML).toBe(before);
  });

  test('running twice changes nothing', () => {
    const el = document.createElement('div');
    tag(el, '#obsidian/test');
    splitNestedTags(el);
    const once = el.innerHTML;
    splitNestedTags(el);
    expect(el.innerHTML).toBe(once);
  });
});

/** A block as Obsidian renders it: text and tags (`#...`) as child nodes, in order. */
function block(parent: HTMLElement, tagName: string, ...parts: string[]): HTMLElement {
  const el = parent.createEl(tagName as keyof HTMLElementTagNameMap);
  for (const part of parts) {
    if (part.startsWith('#')) tag(el, part);
    else el.append(part);
  }
  return el;
}

/** The tags inside the trailing-tags wrapper of each block, in order. */
function trailing(el: HTMLElement): string[][] {
  return Array.from(el.querySelectorAll('.mind-mapper-trailing-tags')).map((span) =>
    Array.from(span.querySelectorAll('a.tag')).map((a) => a.getAttribute('href') ?? ''),
  );
}

describe('markTrailingTags (issue #92)', () => {
  test('tags after the last text of a paragraph are wrapped; the text stays the same', () => {
    const el = document.createElement('div');
    block(el, 'p', 'Book the venue ', '#area/events');
    markTrailingTags(el);
    expect(trailing(el)).toEqual([['#area/events']]);
    expect(el.textContent).toBe('Book the venue #area/events');
    // The wrapper is the paragraph's last child; the space before it stays outside.
    const p = el.querySelector('p');
    expect(p?.lastElementChild?.classList.contains('mind-mapper-trailing-tags')).toBe(true);
    expect(p?.firstChild?.textContent).toBe('Book the venue ');
    expect(el.classList.contains(TRAILING_TAGS_CLASS)).toBe(true);
  });

  test('several trailing tags share one wrapper, the space between them kept', () => {
    const el = document.createElement('div');
    block(el, 'p', 'Ship it ', '#team/growth', ' ', '#solo', ' ');
    markTrailingTags(el);
    expect(trailing(el)).toEqual([['#team/growth', '#solo']]);
    expect(el.querySelector('.mind-mapper-trailing-tags')?.textContent).toBe('#team/growth #solo');
    expect(el.textContent).toBe('Ship it #team/growth #solo ');
  });

  test('a tag in the middle of a sentence stays inline', () => {
    const el = document.createElement('div');
    block(el, 'p', 'Mid ', '#solo', ' in the middle');
    const before = el.innerHTML;
    markTrailingTags(el);
    expect(el.innerHTML).toBe(before);
    expect(el.classList.contains(TRAILING_TAGS_CLASS)).toBe(false);
  });

  test('only the tags after the last text: earlier ones stay inline', () => {
    const el = document.createElement('div');
    block(el, 'p', 'Plain ', '#solo', ', three levels ', '#project/alpha/backend');
    markTrailingTags(el);
    expect(trailing(el)).toEqual([['#project/alpha/backend']]);
  });

  test('headings and task items too; nested-tag pills (split first) as well', () => {
    const el = document.createElement('div');
    block(el, 'h2', 'Backlog ', '#status/open');
    const ul = el.createEl('ul', { cls: 'contains-task-list' });
    const li = ul.createEl('li', { cls: 'task-list-item' });
    li.createEl('input', { type: 'checkbox' });
    li.append('Fix the login ');
    tag(li, '#bug');
    splitNestedTags(el);
    markTrailingTags(el);
    expect(trailing(el)).toEqual([['#status/open'], ['#bug']]);
    expect(el.querySelector('h2 .mind-mapper-trailing-tags .mind-mapper-tag-scope')).not.toBeNull();
  });

  test('without text before them (only tags) or with a line break after them: inline', () => {
    const el = document.createElement('div');
    block(el, 'p', '#solo', ' ', '#bug');
    const p = block(el, 'p', 'First ', '#solo');
    p.createEl('br');
    p.append('second line');
    const before = el.innerHTML;
    markTrailingTags(el);
    expect(el.innerHTML).toBe(before);
  });

  test('a tag inside formatting is not a trailing tag of the block', () => {
    const el = document.createElement('div');
    const p = el.createEl('p', { text: 'Bold ' });
    tag(p.createEl('strong'), '#solo');
    const before = el.innerHTML;
    markTrailingTags(el);
    expect(el.innerHTML).toBe(before);
  });

  test('running twice changes nothing', () => {
    const el = document.createElement('div');
    block(el, 'p', 'Book the venue ', '#area/events', ' ', '#solo');
    markTrailingTags(el);
    const once = el.innerHTML;
    markTrailingTags(el);
    expect(el.innerHTML).toBe(once);
  });
});
