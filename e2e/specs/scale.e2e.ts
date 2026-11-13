import { browser, expect } from '@wdio/globals';
import { generateNote } from '../perf/generateNote';
import { byId, openMindMap, waitForCache } from '../helpers';

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
    await expect(browser.$(`${byId('node.toggle')}[data-mm-state="collapsed"]`)).toExist();
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
  it('a map loaded while hidden (collapsed sidebar) renders no nodes until it is shown', async function () {
    await waitForCache('scale-2000.md');
    const hidden = await browser.executeObsidian(async ({ app }) => {
      app.workspace.detachLeavesOfType('mind-mapper-view');
      app.workspace.rightSplit.collapse();
      const leaf = app.workspace.getRightLeaf(false);
      if (!leaf) throw new Error('no sidebar leaf');
      await leaf.setViewState({ type: 'mind-mapper-view', state: { file: 'scale-2000.md' } });
      await new Promise((r) => setTimeout(r, 500));
      const el = leaf.view.containerEl;
      return {
        width: el.querySelector('.mind-mapper-canvas')?.clientWidth,
        nodes: el.querySelectorAll('.mind-mapper-node').length,
        skeleton: el.querySelectorAll('path.mind-mapper-skeleton').length,
      };
    });
    expect(hidden).toEqual({ width: 0, nodes: 0, skeleton: 0 });
    await browser.executeObsidian(async ({ app }) => {
      app.workspace.rightSplit.expand();
      const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
      if (!leaf) return;
      await app.workspace.revealLeaf(leaf);
      // the commands below act on the active map
      app.workspace.setActiveLeaf(leaf, { focus: true });
    });
    await frames(30);
    try {
      // fitted: 2,000 nodes are a skeleton; at 100 % the view renders its nodes
      expect((await counts()).skeleton).toBe(1);
      await browser.executeObsidianCommand('mind-mapper:reset-zoom');
      await browser.executeObsidianCommand('mind-mapper:back-to-root');
      await frames(30);
      expect((await counts()).nodes).toBeGreaterThan(0);
    } finally {
      await browser.executeObsidian(({ app }) => {
        app.workspace.detachLeavesOfType('mind-mapper-view');
        app.workspace.rightSplit.collapse();
      });
    }
  });
});
