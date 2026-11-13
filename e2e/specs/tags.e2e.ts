import { browser, expect } from '@wdio/globals';
import { leafSummary, openMindMap, settle } from '../helpers';

/** Issue #57: nested tags in node content as two-part pills (scope + value). */
const NOTE = 'demo/Nested tags.md';
const PARAGRAPH = '.mind-mapper-node[data-node-id="Nested tags/#1"]';

interface TagInfo {
  text: string;
  href: string | null;
  label: string | null;
  id: string | null;
  parts: string[];
}

function tags(selector: string): Promise<TagInfo[]> {
  return browser.execute(
    (sel) =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>(`${sel} a.tag`)).map((a) => ({
        text: a.textContent ?? '',
        href: a.getAttribute('href'),
        label: a.getAttribute('aria-label'),
        id: a.getAttribute('data-mm-id'),
        parts: Array.from(a.children)
          .filter((c) => c.getBoundingClientRect().width > 0)
          .map((c) => c.textContent ?? ''),
      })),
    selector,
  );
}

function searchQuery(): Promise<string | null> {
  return browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getLeavesOfType('search')[0];
    const view = leaf?.view as unknown as { getQuery?: () => string } | undefined;
    return view?.getQuery?.() ?? null;
  });
}

describe('nested tags in node content', function () {
  before(async function () {
    await openMindMap(NOTE);
    await settle();
  });

  it('renders nested tags as scope + value, plain tags unchanged', async function () {
    expect(await tags(PARAGRAPH)).toEqual([
      { text: '#solo', href: '#solo', label: null, id: null, parts: [] },
      {
        text: '#obsidian/test',
        href: '#obsidian/test',
        label: '#obsidian/test',
        id: 'node.tag',
        parts: ['#obsidian', 'test'],
      },
      {
        text: '#project/alpha/backend',
        href: '#project/alpha/backend',
        label: '#project/alpha/backend',
        id: 'node.tag',
        parts: ['#project/alpha', 'backend'],
      },
    ]);
  });

  // A click on a tag in a map node does not open the tag search (Obsidian only wires that in its
  // own views; on main too). The split must not change what a click does: same as a plain tag.
  it('a click on a nested tag does what a click on a plain tag does', async function () {
    const after = async (selector: string) => {
      await openMindMap(NOTE);
      await settle();
      await browser.$(selector).click();
      await browser.pause(500);
      return {
        query: await searchQuery(),
        selected: await browser.execute(
          () =>
            document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId,
        ),
        leaves: await leafSummary(),
      };
    };
    const plain = await after(`${PARAGRAPH} a.tag[href="#solo"]`);
    const nested = await after(`${PARAGRAPH} a.tag[href="#obsidian/test"] .mind-mapper-tag-value`);
    expect(nested).toEqual(plain);
  });

  it('hover shows the full tag as tooltip', async function () {
    await openMindMap(NOTE);
    await settle();
    await browser.$(`${PARAGRAPH} a.tag[href="#obsidian/test"]`).moveTo();
    const tooltip = browser.$('.tooltip');
    await tooltip.waitForExist({ timeout: 5000 });
    await expect(tooltip).toHaveText('#obsidian/test');
  });
});
