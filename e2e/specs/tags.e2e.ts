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

function selectedNode(): Promise<string | undefined> {
  return browser.execute(
    () => document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId,
  );
}

/** Obsidian's private core plugin registry (only what the tests use). */
interface CorePlugin {
  enabled: boolean;
  enable(user: boolean): Promise<void>;
  disable(user: boolean): void;
}

async function setSearchEnabled(enabled: boolean): Promise<void> {
  await browser.executeObsidian(async ({ app }, on) => {
    const { internalPlugins } = app as unknown as {
      internalPlugins: { getPluginById(id: string): CorePlugin | null };
    };
    const search = internalPlugins.getPluginById('global-search');
    if (!search || search.enabled === on) return;
    if (on) await search.enable(true);
    else search.disable(true);
  }, enabled);
}

function setSearchQuery(query: string): Promise<void> {
  return browser.executeObsidian(({ app }, q) => {
    const leaf = app.workspace.getLeavesOfType('search')[0];
    const view = leaf?.view as unknown as { setQuery?: (q: string) => void } | undefined;
    view?.setQuery?.(q);
  }, query);
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

  // Issue #77: a click on a tag opens the tag search like in reading view (Obsidian's private
  // global-search plugin, guarded). Like any link in a node it is no node click: the selection
  // stays as it was (here: the root), and no note opens.
  async function clickTag(selector: string) {
    await openMindMap(NOTE);
    await settle();
    await browser.$('.mind-mapper-node.is-root .mind-mapper-node-content').click();
    const selected = await selectedNode();
    const leaves = await leafSummary();
    await browser.$(selector).click();
    await browser.pause(500);
    return {
      query: await searchQuery(),
      selectionUnchanged: typeof selected === 'string' && (await selectedNode()) === selected,
      leavesUnchanged: JSON.stringify(await leafSummary()) === JSON.stringify(leaves),
    };
  }

  it('a click on a plain tag opens the search with the tag query', async function () {
    expect(await clickTag(`${PARAGRAPH} a.tag[href="#solo"]`)).toEqual({
      query: 'tag:#solo',
      selectionUnchanged: true,
      leavesUnchanged: true,
    });
  });

  it('a click on either part of a nested-tag pill searches the full tag', async function () {
    const pill = `${PARAGRAPH} a.tag[href="#project/alpha/backend"]`;
    const expected = {
      query: 'tag:#project/alpha/backend',
      selectionUnchanged: true,
      leavesUnchanged: true,
    };
    expect(await clickTag(`${pill} .mind-mapper-tag-value`)).toEqual(expected);
    await setSearchQuery('');
    expect(await clickTag(`${pill} .mind-mapper-tag-scope`)).toEqual(expected);
  });

  it('with the search core plugin disabled a tag click does nothing, without an error', async function () {
    await setSearchEnabled(false);
    try {
      await browser.execute(() => {
        const w = window as unknown as { mmErrors: string[] };
        w.mmErrors = [];
        window.addEventListener('error', (e) => w.mmErrors.push(String(e.message)));
      });
      const result = await clickTag(
        `${PARAGRAPH} a.tag[href="#obsidian/test"] .mind-mapper-tag-value`,
      );
      expect(result).toEqual({ query: null, selectionUnchanged: true, leavesUnchanged: true });
      expect(
        await browser.execute(() => (window as unknown as { mmErrors: string[] }).mmErrors),
      ).toEqual([]);
    } finally {
      await setSearchEnabled(true);
    }
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
