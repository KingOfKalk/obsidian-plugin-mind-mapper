import { splitNestedTags, splitTag } from '../../src/render/nestedTags';

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
