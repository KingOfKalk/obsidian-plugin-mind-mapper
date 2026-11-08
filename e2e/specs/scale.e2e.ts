import { browser, expect } from '@wdio/globals';
import { generateNote } from '../perf/generateNote';
import { openMindMap, waitForCache } from '../helpers';

function counts() {
  return browser.execute(() => ({
    nodes: document.querySelectorAll('.mind-mapper-node').length,
    edges: document.querySelectorAll('path.mind-mapper-edge').length,
    skeleton: document.querySelectorAll('path.mind-mapper-skeleton').length,
  }));
}

async function frames(n: number): Promise<void> {
  await browser.execute(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(r));
  }, n);
}

describe('scale', function () {
  it('a 2,000-node map is culled: skeleton at fit, bounded DOM at 100 %, content after panning', async function () {
    const path = 'scale-2000.md';
    await browser.executeObsidian(
      async ({ app }, notePath, text) => {
        await app.vault.adapter.write(notePath, text);
      },
      path,
      generateNote(2000, 2000),
    );
    await waitForCache(path);
    await openMindMap(path);
    await frames(30);
    const total = await browser.executeObsidian(({ app }) => {
      const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
      return (leaf?.view as unknown as { layout: { nodes: unknown[] } }).layout.nodes.length;
    });
    const atFit = await counts();
    expect(atFit).toEqual({ nodes: 0, edges: total - 1, skeleton: 1 });

    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await frames(30);
    const at100 = await counts();
    expect(at100.nodes).toBeGreaterThan(0);
    expect(at100.nodes).toBeLessThanOrEqual(400);
    expect(at100.edges).toBe(total - 1);
    expect(at100.skeleton).toBe(0);

    await browser.execute(() => {
      const canvas = document.querySelector('.mind-mapper-canvas');
      for (let i = 0; i < 30; i++) {
        canvas?.dispatchEvent(
          new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
        );
      }
    });
    await frames(30);
    const panned = await browser.execute(() => {
      const contents = Array.from(
        document.querySelectorAll<HTMLElement>('.mind-mapper-node-content'),
      );
      return {
        nodes: document.querySelectorAll('.mind-mapper-node').length,
        measured: contents.filter((el) => el.offsetWidth > 0).length,
      };
    });
    expect(panned.nodes).toBeGreaterThan(0);
    expect(panned.nodes).toBeLessThanOrEqual(400);
    expect(panned.measured).toBe(panned.nodes);

    // 25 %: text unreadable, many nodes in view: DOM stays bounded (skeleton above 300)
    await browser.executeObsidian(({ app }) => {
      const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
      const view = leaf?.view as unknown as {
        getTransform(): { x: number; y: number; zoom: number };
        setTransform(t: { x: number; y: number; zoom: number }): void;
      };
      const t = view.getTransform();
      view.setTransform({ ...t, zoom: 0.25 });
    });
    await frames(30);
    expect((await counts()).nodes).toBeLessThanOrEqual(300);
  });

  it('collapse and the expand overlay work on a culled map', async function () {
    await openMindMap('scale-2000.md');
    await browser.executeObsidianCommand('mind-mapper:reset-zoom');
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    await frames(30);
    const edgesBefore = (await counts()).edges;
    await browser.execute(() => {
      document.querySelector<HTMLElement>('.mind-mapper-collapse')?.click();
    });
    await frames(5);
    await expect(browser.$('.mind-mapper-collapse.is-collapsed')).toExist();
    expect((await counts()).edges).toBeLessThan(edgesBefore);
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>('.mind-mapper-node:not(.is-root) .mind-mapper-node-expand')
        ?.click();
    });
    await browser.$('.mind-mapper-full-content').waitForExist({ timeout: 5000 });
    await browser.keys('Escape');
    await browser.$('.mind-mapper-full-content').waitForExist({ reverse: true, timeout: 5000 });
  });
});
