import { ELEMENT_ID_ATTR, setElementId } from '../elementIds';
import { tagPositionClass } from '../tagPositions';

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

/** One level of a tag: what is shown and the tag it searches for (issue #105). */
export interface TagLevel {
  /** `#project`, `alpha`, `backend` (the `#` belongs to the first level). */
  text: string;
  /** `#project`, `#project/alpha`, `#project/alpha/backend`. */
  target: string;
}

/** `#project/alpha/backend` -> one level per segment, each with its own search target. */
export function tagLevels(tag: string): TagLevel[] {
  const levels: TagLevel[] = [];
  let target = '';
  for (const segment of tag.split('/')) {
    target = target === '' ? segment : `${target}/${segment}`;
    levels.push({ text: segment, target });
  }
  return levels;
}

/** Search target of a segment (`#project/alpha`); read by the click handler. */
export const SEGMENT_TARGET_ATTR = 'data-mm-search';

const SEGMENT_CLASS = 'mind-mapper-tag-segment';
const SLASH_CLASS = 'mind-mapper-tag-slash';

/**
 * Nested tags rendered by Obsidian (`a.tag`) get the structure for both looks. Pill modes: scope +
 * value, styled by styles.css with Obsidian's tag colors. Text mode (issue #105): the same spans
 * as one segment per level with the `/` between them (`span.mind-mapper-tag-segment`, its search
 * target in `data-mm-search`). The link itself stays (href, Obsidian's handling); every `/` stays
 * in the text, so its text and a copy are still the full tag. Plain tags keep their look.
 * Idempotent.
 */
export function splitNestedTags(el: HTMLElement): void {
  for (const a of Array.from(el.querySelectorAll<HTMLElement>('a.tag'))) {
    if (a.classList.contains('mind-mapper-tag')) continue;
    const tag = a.textContent ?? '';
    const parts = splitTag(tag);
    if (!parts) continue;
    const levels = tagLevels(tag);
    const value = levels.pop();
    a.empty();
    const scope = a.createSpan({ cls: 'mind-mapper-tag-scope' });
    levels.forEach((level, i) => {
      if (i > 0) scope.createSpan({ cls: SLASH_CLASS, text: '/' });
      appendSegment(scope, level);
    });
    a.createSpan({ cls: `mind-mapper-tag-separator ${SLASH_CLASS}`, text: '/' });
    if (value) appendSegment(a, value, 'mind-mapper-tag-value');
    a.addClass('mind-mapper-tag');
    // Obsidian shows aria-label as tooltip: the full tag on hover and for screen readers.
    a.setAttribute('aria-label', tag);
    setElementId(a, 'node.tag');
  }
}

function appendSegment(parent: HTMLElement, level: TagLevel, cls = ''): void {
  const segment = parent.createSpan({ cls: `${SEGMENT_CLASS} ${cls}`.trim(), text: level.text });
  segment.setAttribute(SEGMENT_TARGET_ATTR, level.target);
  setElementId(segment, 'node.tag-segment');
}

/**
 * Applies the tags mode to rendered content (issue #105). `text`: each segment's tooltip is its
 * search target (Obsidian shows the closest `aria-label`; the tag keeps the full tag for screen
 * readers) and there is no tag row, so no `node.tags` ID. The pill modes: the full tag is the
 * tooltip everywhere and the last line's wrapper is the tag row. Idempotent; cheap.
 */
export function setTextTags(el: HTMLElement, text: boolean): void {
  for (const segment of Array.from(el.querySelectorAll<HTMLElement>(`.${SEGMENT_CLASS}`))) {
    const target = segment.getAttribute(SEGMENT_TARGET_ATTR);
    if (text && target !== null) {
      if (segment.getAttribute('aria-label') !== target) segment.setAttribute('aria-label', target);
    } else if (segment.hasAttribute('aria-label')) {
      segment.removeAttribute('aria-label');
    }
  }
  for (const row of Array.from(el.querySelectorAll<HTMLElement>(`.${LAST_LINE_CLASS}`))) {
    if (!text) setElementId(row, 'node.tags');
    else if (row.hasAttribute(ELEMENT_ID_ATTR)) row.removeAttribute(ELEMENT_ID_ATTR);
  }
}

/** Whether `el` is inside a map (or overlay) in tags mode `text`. */
export function inTextMode(el: Element): boolean {
  return el.closest(`.${tagPositionClass('text')}`) !== null;
}

/**
 * In text mode, a click on a nested tag that is not on one of its segments (the `/` or the space
 * around it) is a click on text, not on a tag (issue #105): no search, the node gets the click.
 */
export function isTagSlash(target: Element): boolean {
  const tag = target.closest('a.tag.mind-mapper-tag');
  return tag !== null && inTextMode(tag) && target.closest(`.${SEGMENT_CLASS}`) === null;
}

/**
 * The tag a click on `tag` searches for: in text mode the level of the clicked segment
 * (`#project/alpha`), else the full tag (`#project/alpha/backend`, the href Obsidian set).
 */
export function tagSearchTarget(tag: HTMLElement, target: Element): string {
  const full = tag.getAttribute('href') ?? tag.textContent ?? '';
  if (!inTextMode(tag)) return full;
  const segment = target.closest(`.${SEGMENT_CLASS}`);
  return segment?.getAttribute(SEGMENT_TARGET_ATTR) ?? full;
}

/** On a content element with trailing tags: it may stretch to its node (styles.css, issue #92). */
export const TRAILING_TAGS_CLASS = 'has-trailing-tags';

/**
 * On the trailing-tags wrapper at the very end of the node (its last line, issue #103): with the
 * tag position `outside` it is the tag row below the box (`node.tags`, styles.css).
 */
export const LAST_LINE_CLASS = 'is-last-line';

const TEXT_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li';

/**
 * Trailing tags (issue #92): the tags at the end of a paragraph, heading or list item, after its
 * last text, go into one `span.mind-mapper-trailing-tags`, which styles.css moves to the side
 * opposite the node's text alignment. Tags in the middle of a sentence, inside formatting, before
 * a line break or without text before them stay inline. The wrapper with nothing after it in the
 * node gets LAST_LINE_CLASS (issue #103). Idempotent.
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
  const wrappers = Array.from(el.querySelectorAll<HTMLElement>('.mind-mapper-trailing-tags'));
  el.toggleClass(TRAILING_TAGS_CLASS, wrappers.length > 0);
  const last = wrappers[wrappers.length - 1];
  if (last && endsNode(last, el)) {
    last.addClass(LAST_LINE_CLASS);
    setElementId(last, 'node.tags');
  }
}

/** Nothing but whitespace after `node` up to the end of `root`. */
function endsNode(node: Element, root: Element): boolean {
  for (let n: Element | null = node; n && n !== root; n = n.parentElement) {
    for (let next = n.nextSibling; next; next = next.nextSibling) {
      if (!isBlank(next)) return false;
    }
  }
  return true;
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
