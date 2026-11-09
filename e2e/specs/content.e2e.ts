import { browser, expect } from '@wdio/globals';
import { nodeBoxes, openMindMap, overlaps, settle } from '../helpers';

function node(id: string) {
  return browser.$(`.mind-mapper-node[data-node-id="${id}"]`);
}

/** Size of a node element at zoom 1 (offset sizes ignore the CSS transform). */
async function offsetSize(id: string): Promise<{ width: number; height: number }> {
  return browser.execute((nodeId) => {
    const el = document.querySelector<HTMLElement>(`.mind-mapper-node[data-node-id="${nodeId}"]`);
    return { width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 };
  }, id);
}

describe('node content in real Obsidian', function () {
  it('worked example renders the spec tree', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    const expected = [
      'Project',
      'Project/#1',
      'Project/Notes',
      'Project/Notes/#1',
      'Project/Tasks',
      'Project/Tasks/#1',
      'Project/Tasks/#2',
    ].sort();
    // Content nodes appear over a few frames (render budget); slower CI runners need longer
    // than `settle`. On a timeout, report what was rendered to tell timing from culling.
    let ids: string[] = [];
    await browser
      .waitUntil(
        async () => {
          ids = (await nodeBoxes()).map((b) => b.id).sort();
          return ids.length === expected.length;
        },
        { timeout: 10000, interval: 200 },
      )
      .catch(async () => {
        const state = await browser.execute(() => ({
          transform: document.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform,
          canvas: document.querySelector('.mind-mapper-canvas')?.getBoundingClientRect().width,
        }));
        console.log('worked example rendered', JSON.stringify({ ids, state }));
      });
    expect(ids).toEqual(expected);
    await expect(node('Project/Notes/#1').$('blockquote')).toExist();
  });

  it('task checkboxes are disabled and clicking leaves the note unchanged', async function () {
    await openMindMap('fixtures/worked-example.md');
    const checkbox = node('Project/Tasks/#1').$('input[type="checkbox"]');
    await expect(checkbox).toExist();
    await expect(checkbox).toBeDisabled();
    const inside = await browser.execute(() => {
      const nodeEl = document.querySelector('.mind-mapper-node[data-node-id="Project/Tasks/#1"]');
      const box = nodeEl?.querySelector('input[type="checkbox"]')?.getBoundingClientRect();
      const outer = nodeEl?.getBoundingClientRect();
      return (
        !!box &&
        !!outer &&
        box.width > 0 &&
        box.left >= outer.left &&
        box.right <= outer.right &&
        box.top >= outer.top &&
        box.bottom <= outer.bottom
      );
    });
    expect(inside).toBe(true);
    const before = await browser.executeObsidian(({ app }) =>
      app.vault.adapter.read('fixtures/worked-example.md'),
    );
    await browser.execute(() => {
      document
        .querySelector<HTMLInputElement>(
          '.mind-mapper-node[data-node-id="Project/Tasks/#1"] input[type="checkbox"]',
        )
        ?.click();
    });
    await browser.pause(500);
    const after = await browser.executeObsidian(({ app }) =>
      app.vault.adapter.read('fixtures/worked-example.md'),
    );
    expect(after).toBe(before);
  });

  it('long code is clipped at the max size and the overlay shows everything', async function () {
    await openMindMap('fixtures/long-content.md');
    await settle();
    // 2,000 short code lines: natural width, height capped at the max
    const code = await offsetSize('Long content/#1');
    expect(code.height).toBe(240);
    expect(code.width).toBeLessThan(320);
    // 40-column table: width capped at the max
    expect((await offsetSize('Long content/#2')).width).toBe(320);
    await expect(node('Long content/#1')).toHaveElementClass('is-clipped');
    await expect(node('Long content/#2')).toHaveElementClass('is-clipped');
    // the fade sits on the visible edge of the overflowing axis
    const fade = await browser.execute(() => {
      const content = (id: string) =>
        document.querySelector<HTMLElement>(
          `.mind-mapper-node[data-node-id="${id}"] .mind-mapper-node-content`,
        );
      // unprefixed mask-image needs Chrome 120+; older Obsidian versions use the -webkit- one
      const mask = (el: HTMLElement | null) => {
        if (!el) return '';
        const style = getComputedStyle(el);
        return style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image');
      };
      const code = content('Long content/#1');
      const table = content('Long content/#2');
      return {
        codeHeight: code?.clientHeight ?? 0,
        codeMask: mask(code),
        tableMask: mask(table),
      };
    });
    expect(fade.codeHeight).toBeLessThanOrEqual(228);
    // computed style drops the default direction `to bottom`
    expect(fade.codeMask).toContain('linear-gradient');
    expect(fade.codeMask).not.toMatch(/to right|90deg/);
    expect(fade.tableMask).toMatch(/to right|90deg/);
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          '.mind-mapper-node[data-node-id="Long content/#1"] .mind-mapper-node-expand',
        )
        ?.click();
    });
    const modal = browser.$('.mind-mapper-full-content');
    await expect(modal).toExist();
    await browser.waitUntil(async () => (await modal.getText()).includes('line 2000'), {
      timeout: 10000,
      timeoutMsg: 'overlay does not show the last code line',
    });
    await browser.keys('Escape');
  });

  it('mermaid, table, math and callout render', async function () {
    await openMindMap('fixtures/blocks.md');
    await settle();
    expect(await node('Blocks/#2').$$('svg').length).toBeGreaterThan(0);
    await expect(node('Blocks/#3').$('table')).toExist();
    expect(await node('Blocks/#4').$$('mjx-container').length).toBeGreaterThan(0);
    await expect(node('Blocks/#6').$('.callout')).toExist();
  });

  it('image embeds sit in a fixed thumbnail box; note embeds are plain links', async function () {
    await openMindMap('fixtures/embeds.md');
    await settle();
    await expect(node('Embeds/#1').$('img')).toExist();
    const box = await browser.execute(() => {
      const img = document.querySelector<HTMLElement>(
        '.mind-mapper-node[data-node-id="Embeds/#1"] img',
      );
      return { width: img?.offsetWidth ?? 0, height: img?.offsetHeight ?? 0 };
    });
    expect(box).toEqual({ width: 160, height: 120 });
    await expect(node('Embeds/#2').$('a.internal-link')).toExist();
    await expect(node('Embeds/#2').$('.markdown-embed')).not.toExist();
  });

  it('no node failed to render and no nodes overlap', async function () {
    for (const note of [
      'fixtures/worked-example.md',
      'fixtures/lists.md',
      'fixtures/blocks.md',
      'fixtures/embeds.md',
      'fixtures/long-content.md',
      'fixtures/paragraphs.md',
    ]) {
      await openMindMap(note);
      await settle();
      await expect(browser.$('.mind-mapper-node.is-render-error')).not.toExist();
      const boxes = await nodeBoxes();
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const [first, second] = [boxes[a], boxes[b]];
          if (first && second && overlaps(first, second)) {
            throw new Error(`${note}: ${first.id} overlaps ${second.id}`);
          }
        }
      }
    }
  });
});

describe('tab switching', function () {
  it('hiding and showing the map tab keeps sizes and the viewport', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector('.mind-mapper-canvas')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaX: 40, deltaY: -30, bubbles: true, cancelable: true }),
        );
    });
    const snapshot = () =>
      browser.execute(() => ({
        transform: document.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform,
        boxes: Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node')).map(
          (el) =>
            `${el.dataset.nodeId}:${el.style.left},${el.style.top},${el.style.width},${el.style.height}`,
        ),
      }));
    const before = await snapshot();

    // open another note as a tab in the map's tab group: the map is hidden (display: none)
    await browser.executeObsidian(async ({ app }) => {
      const [map] = app.workspace.getLeavesOfType('mind-mapper-view');
      if (!map) throw new Error('no map');
      app.workspace.setActiveLeaf(map, { focus: true });
      const file = app.vault.getFileByPath('fixtures/lists.md');
      if (file) await app.workspace.getLeaf('tab').openFile(file);
    });
    await browser.pause(1000);
    await browser.executeObsidian(async ({ app }) => {
      const [map] = app.workspace.getLeavesOfType('mind-mapper-view');
      if (map) await app.workspace.revealLeaf(map);
    });
    await settle();
    expect(await snapshot()).toEqual(before);
  });
});
