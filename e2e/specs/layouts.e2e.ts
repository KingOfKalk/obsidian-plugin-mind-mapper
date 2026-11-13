import { browser, expect } from '@wdio/globals';
import { nodeBoxes, openMindMap, overlaps, settle, writeNote } from '../helpers';

const LAYOUTS = [
  'circle-clockwise',
  'circle-counter-clockwise',
  'left-to-right',
  'right-to-left',
  'top-to-bottom',
  'bottom-to-top',
  'kanban',
];

const NOTES = [
  'fixtures/worked-example.md',
  'fixtures/lists.md',
  'fixtures/blocks.md',
  'fixtures/embeds.md',
  'fixtures/long-content.md',
  'fixtures/paragraphs.md',
];

async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  await browser.executeObsidian(async ({ app }, settings) => {
    const plugins = (
      app as unknown as {
        plugins: { plugins: Record<string, { updateSettings(p: unknown): Promise<void> }> };
      }
    ).plugins.plugins;
    const plugin = plugins['mind-mapper'];
    if (!plugin) throw new Error('plugin not loaded');
    await plugin.updateSettings(settings);
  }, patch);
}

/** Toggles whose rect intersects their own node's rect (they must sit outside). */
function togglesOnNodes(): Promise<string[]> {
  return browser.execute(() => {
    const bad: string[] = [];
    for (const toggle of Array.from(
      document.querySelectorAll<HTMLElement>('.mind-mapper-collapse'),
    )) {
      const id = toggle.dataset.nodeId ?? '';
      const node = document.querySelector(`.mind-mapper-node[data-node-id="${id}"]`);
      if (!node) continue;
      const a = toggle.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      if (
        a.left < b.right - 0.5 &&
        b.left < a.right - 0.5 &&
        a.top < b.bottom - 0.5 &&
        b.top < a.bottom - 0.5
      ) {
        bad.push(`${id} (${toggle.className})`);
      }
    }
    return bad;
  });
}

describe('layouts', function () {
  after(async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise', levelGap: 60 });
  });

  it('every layout renders every fixture without overlaps, toggles outside their nodes', async function () {
    for (const note of NOTES) {
      await openMindMap(note);
      for (const layout of LAYOUTS) {
        await updateSettings({ defaultLayout: layout });
        await settle();
        const boxes = await nodeBoxes();
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const [first, second] = [boxes[a], boxes[b]];
            if (first && second && overlaps(first, second)) {
              throw new Error(`${layout} ${note}: ${first.id} overlaps ${second.id}`);
            }
          }
        }
        expect({ layout, note, bad: await togglesOnNodes() }).toEqual({ layout, note, bad: [] });
      }
    }
  });

  it('a settings change re-lays out an open map', async function () {
    await updateSettings({ defaultLayout: 'left-to-right', levelGap: 60 });
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const x = async () => (await nodeBoxes()).find((b) => b.id === 'Project/Tasks')?.x ?? 0;
    const before = await x();
    await updateSettings({ levelGap: 200 });
    await settle();
    expect(await x()).toBeGreaterThan(before + 100);
  });
});

describe('frontmatter', function () {
  it('mind-mapper-layout and mind-mapper-title apply', async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise' });
    await openMindMap('fixtures/fm-layout.md');
    await settle();
    await expect(browser.$('.mind-mapper-node.is-root')).toHaveText('Custom title');
    const boxes = await nodeBoxes();
    const root = boxes.find((b) => b.id === 'Root');
    if (!root) throw new Error('no root');
    for (const box of boxes.filter((b) => b.id !== 'Root')) {
      expect(box.y).toBeGreaterThan(root.y + root.height);
    }
  });

  it('an invalid layout shows one notice across reopen and edits', async function () {
    const path = 'invalid-layout.md';
    const text = (n: number) => `---\nmind-mapper-layout: sideways\n---\n# Root\n\n## A${n}\n`;
    await writeNote(path, text(1));
    await openMindMap(path);
    await openMindMap(path);
    await browser.executeObsidian(
      async ({ app }, notePath, content) => {
        await app.vault.adapter.write(notePath, content);
      },
      path,
      text(2),
    );
    await browser.$('.mind-mapper-node[data-node-id="Root/A2"]').waitForExist({ timeout: 10000 });
    const notices = await browser.execute(
      () =>
        Array.from(document.querySelectorAll('.notice')).filter((el) =>
          el.textContent?.includes('unknown mind-mapper-layout "sideways"'),
        ).length,
    );
    expect(notices).toBe(1);
  });
});

describe('dividers', function () {
  it('are drawn in the gap between their two neighbors', async function () {
    await openMindMap('fixtures/thematic-breaks.md');
    await settle();
    const result = await browser.execute(() => {
      const rect = (id: string) =>
        document.querySelector(`.mind-mapper-node[data-node-id="${id}"]`)?.getBoundingClientRect();
      const lines = [...document.querySelectorAll('path.mind-mapper-divider')].map((p) =>
        p.getBoundingClientRect(),
      );
      const above = rect('Dividers/#1');
      const below = rect('Dividers/#2');
      const first = lines.sort((a, b) => a.top - b.top)[0];
      return {
        count: lines.length,
        stroke: getComputedStyle(document.querySelector('path.mind-mapper-divider')!).stroke,
        between:
          !!above && !!below && !!first && first.top > above.bottom && first.bottom < below.top,
      };
    });
    expect(result.count).toBe(7);
    expect(result.between).toBe(true);
    expect(result.stroke).not.toBe('none');
  });

  it('before a heading divide whole branches', async function () {
    await openMindMap('fixtures/dividers-headings.md');
    await settle();
    const result = await browser.execute(() => {
      const rect = (id: string) =>
        document.querySelector(`.mind-mapper-node[data-node-id="${id}"]`)?.getBoundingClientRect();
      const lines = [...document.querySelectorAll('path.mind-mapper-divider')].map((p) =>
        p.getBoundingClientRect(),
      );
      const entry = rect('example/test one/#1');
      const heading = rect('example/test one/test two');
      const child = rect('example/test one/test two/#1');
      const between = lines.filter(
        (l) => !!entry && !!heading && l.top > entry.bottom && l.bottom < heading.top,
      );
      const line = between[0];
      return {
        count: between.length,
        startsAtColumn: !!line && !!entry && Math.abs(line.left - entry.left) <= 1,
        // The line divides whole branches: it reaches the right edge of test two's children.
        reachesChildren: !!line && !!child && line.right >= child.right - 1,
        pastHeading: !!line && !!heading && line.right > heading.right + 1,
      };
    });
    expect(result.count).toBe(1);
    expect(result.startsAtColumn).toBe(true);
    expect(result.reachesChildren).toBe(true);
    expect(result.pastHeading).toBe(true);
  });
});
