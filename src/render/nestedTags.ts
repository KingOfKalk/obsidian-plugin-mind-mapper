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
