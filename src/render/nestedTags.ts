import { setElementId } from '../elementIds';

/** A nested tag split at its last `/` (GitLab's scoped label rule, issue #57). */
export interface TagParts {
  /** `#` and everything before the last `/`: `#project/alpha`. */
  scope: string;
  /** The last segment: `backend`. */
  value: string;
}

/** `#project/alpha/backend` -> `#project/alpha` + `backend`; null for a plain tag. */
export function splitTag(tag: string): TagParts | null {
  const slash = tag.lastIndexOf('/');
  const scope = tag.slice(0, slash);
  const value = tag.slice(slash + 1);
  if (slash < 0 || scope.replace(/^#/, '') === '' || value === '') return null;
  return { scope, value };
}

/**
 * Nested tags rendered by Obsidian (`a.tag`) become a two-part pill: scope + value, styled by
 * styles.css with Obsidian's tag colors. The link itself stays (href, Obsidian's handling); the
 * `/` stays in its text, hidden, so its text and a copy are still the full tag. Plain tags keep
 * their look. Idempotent.
 */
export function splitNestedTags(el: HTMLElement): void {
  for (const a of Array.from(el.querySelectorAll<HTMLElement>('a.tag'))) {
    if (a.classList.contains('mind-mapper-tag')) continue;
    const tag = a.textContent ?? '';
    const parts = splitTag(tag);
    if (!parts) continue;
    a.empty();
    a.createSpan({ cls: 'mind-mapper-tag-scope', text: parts.scope });
    a.createSpan({ cls: 'mind-mapper-tag-separator', text: '/' });
    a.createSpan({ cls: 'mind-mapper-tag-value', text: parts.value });
    a.addClass('mind-mapper-tag');
    // Obsidian shows aria-label as tooltip: the full tag on hover and for screen readers.
    a.setAttribute('aria-label', tag);
    setElementId(a, 'node.tag');
  }
}

/** On a content element with trailing tags: it may stretch to its node (styles.css, issue #92). */
export const TRAILING_TAGS_CLASS = 'has-trailing-tags';

const TEXT_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li';

/**
 * Trailing tags (issue #92): the tags at the end of a paragraph, heading or list item, after its
 * last text, go into one `span.mind-mapper-trailing-tags`, which styles.css moves to the side
 * opposite the node's text alignment. Tags in the middle of a sentence, inside formatting, before
 * a line break or without text before them stay inline. Idempotent.
 */
export function markTrailingTags(el: HTMLElement): void {
  for (const block of Array.from(el.querySelectorAll<HTMLElement>(TEXT_BLOCKS))) {
    if (block.querySelector(':scope > .mind-mapper-trailing-tags')) continue;
    const tags: ChildNode[] = [];
    let node = block.lastChild;
    while (node && (isBlank(node) || isTag(node))) {
      tags.unshift(node);
      node = node.previousSibling;
    }
    // Trailing whitespace stays outside the wrapper; the first wrapped node is a tag.
    while (tags.length > 0 && !isTag(tags[0])) tags.shift();
    const first = tags[0];
    if (!first || !hasTextBefore(first)) continue;
    // Up to the last tag: whitespace after it stays outside the wrapper too.
    let end = tags.length;
    while (!isTag(tags[end - 1])) end--;
    const wrapper = block.doc.createElement('span');
    wrapper.className = 'mind-mapper-trailing-tags';
    first.before(wrapper);
    wrapper.append(...tags.slice(0, end));
  }
  el.toggleClass(TRAILING_TAGS_CLASS, el.querySelector('.mind-mapper-trailing-tags') !== null);
}

function isTag(node: ChildNode | undefined): boolean {
  return node?.instanceOf(HTMLElement) === true && node.matches('a.tag');
}

function isBlank(node: ChildNode): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() === '';
}

/** Some text (not only tags) before `node` in its block. */
function hasTextBefore(node: ChildNode): boolean {
  for (let n = node.previousSibling; n; n = n.previousSibling) {
    if (!isTag(n) && (n.textContent ?? '').trim() !== '') return true;
  }
  return false;
}
