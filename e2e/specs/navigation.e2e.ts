import { browser, expect } from '@wdio/globals';
import { leafSummary, openMindMap, openNote, settle } from '../helpers';

function worldTransform(): Promise<string> {
  return browser.execute(
    () => document.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform ?? '',
  );
}

function crossLinkCount(): Promise<number> {
  return browser.execute(() => document.querySelectorAll('path.mind-mapper-crosslink').length);
}

describe('cross-links', function () {
  it('are drawn for same-note heading and block links and follow collapse', async function () {
    await openMindMap('fixtures/crosslinks.md');
    await settle();
    expect(await crossLinkCount()).toBe(6);
    await browser.executeObsidianCommand('mind-mapper:collapse-all');
    expect(await crossLinkCount()).toBe(3);
    await browser.executeObsidianCommand('mind-mapper:expand-all');
    expect(await crossLinkCount()).toBe(6);
  });
});

describe('full screen', function () {
  it('covers the window; Esc closes an open overlay first, then exits and restores the view', async function () {
    await openMindMap('fixtures/long-content.md');
    await settle();
    const before = await worldTransform();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    const rect = await browser.execute(() => {
      const el = document.querySelector('.mind-mapper-full-screen');
      const r = el?.getBoundingClientRect();
      return r
        ? {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            w: innerWidth,
            h: innerHeight,
          }
        : null;
    });
    expect(rect).toEqual({
      left: 0,
      top: 0,
      width: rect?.w,
      height: rect?.h,
      w: rect?.w,
      h: rect?.h,
    });
    // the map fills the overlay
    const canvas = await browser.execute(() => {
      const r = document
        .querySelector('.mind-mapper-full-screen .mind-mapper-canvas')
        ?.getBoundingClientRect();
      return r ? { width: r.width, height: r.height } : null;
    });
    expect(canvas).toEqual({ width: rect?.w, height: rect?.h });

    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          '.mind-mapper-node[data-node-id="Long content/#1"] .mind-mapper-node-expand',
        )
        ?.click();
    });
    await browser.$('.mind-mapper-full-content').waitForExist({ timeout: 5000 });
    await browser.keys('Escape');
    await browser.$('.mind-mapper-full-content').waitForExist({ reverse: true, timeout: 5000 });
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await browser.keys('Escape');
    await browser.$('.mind-mapper-full-screen').waitForExist({ reverse: true, timeout: 5000 });
    expect(await worldTransform()).toBe(before);
    await expect(browser.$('.workspace-leaf-content .mind-mapper-canvas')).toExist();
  });

  it('the exit button is not covered (window controls) and leaves full screen', async function () {
    await openMindMap('fixtures/worked-example.md');
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    const onTop = await browser.execute(() => {
      const button = document.querySelector<HTMLElement>('.mind-mapper-exit-full-screen');
      const r = button?.getBoundingClientRect();
      if (!button || !r) return false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && button.contains(hit);
    });
    expect(onTop).toBe(true);
    await browser.execute(() => {
      document.querySelector<HTMLElement>('.mind-mapper-exit-full-screen')?.click();
    });
    await expect(browser.$('.mind-mapper-full-screen')).not.toExist();
  });
});

describe('back to root', function () {
  it('centres and selects the root', async function () {
    await openMindMap('fixtures/lists.md');
    await settle();
    await browser.execute(() => {
      document
        .querySelector('.mind-mapper-canvas')
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaX: 300, deltaY: 200, bubbles: true, cancelable: true }),
        );
    });
    await browser.executeObsidianCommand('mind-mapper:back-to-root');
    const offset = await browser.execute(() => {
      const canvas = document.querySelector('.mind-mapper-canvas')?.getBoundingClientRect();
      const root = document.querySelector('.mind-mapper-node.is-root')?.getBoundingClientRect();
      if (!canvas || !root) return null;
      return {
        dx: Math.abs(root.left + root.width / 2 - (canvas.left + canvas.width / 2)),
        dy: Math.abs(root.top + root.height / 2 - (canvas.top + canvas.height / 2)),
      };
    });
    expect(offset?.dx).toBeLessThan(1);
    expect(offset?.dy).toBeLessThan(1);
    await expect(browser.$('.mind-mapper-node.is-root')).toHaveElementClass('is-selected');
  });
});

describe('open entry points', function () {
  it('file menu opens the map', async function () {
    await browser.executeObsidian(({ app }) =>
      app.workspace.detachLeavesOfType('mind-mapper-view'),
    );
    await browser.executeObsidian(({ app, obsidian }) => {
      const file = app.vault.getFileByPath('fixtures/lists.md');
      if (!file) throw new Error('missing');
      const menu = new obsidian.Menu();
      app.workspace.trigger('file-menu', menu, file, 'file-explorer');
      menu.showAtPosition({ x: 20, y: 20 });
    });
    const item = browser.$('.menu-item*=Open as mind map');
    await item.waitForExist({ timeout: 5000 });
    await item.click();
    await browser.waitUntil(
      async () =>
        (await leafSummary()).some(
          (l) => l.type === 'mind-mapper-view' && l.file === 'fixtures/lists.md',
        ),
      { timeout: 10000, timeoutMsg: 'file menu did not open the map' },
    );
  });

  it('ribbon icon opens the active note', async function () {
    await browser.executeObsidian(({ app }) =>
      app.workspace.detachLeavesOfType('mind-mapper-view'),
    );
    await openNote('fixtures/blocks.md');
    await browser.$('.side-dock-ribbon-action[aria-label="Open as mind map"]').click();
    await browser.waitUntil(
      async () =>
        (await leafSummary()).some(
          (l) => l.type === 'mind-mapper-view' && l.file === 'fixtures/blocks.md',
        ),
      { timeout: 10000, timeoutMsg: 'ribbon did not open the map' },
    );
  });
});

describe('popout window', function () {
  it('renders, measures, pans and goes full screen in the popout', async function () {
    await browser.executeObsidian(async ({ app }) => {
      app.workspace.detachLeavesOfType('mind-mapper-view');
      const leaf = app.workspace.openPopoutLeaf();
      await leaf.setViewState({
        type: 'mind-mapper-view',
        active: true,
        state: { file: 'fixtures/worked-example.md' },
      });
    });
    const probe = () =>
      browser.executeObsidian(({ app }) => {
        const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
        const el = leaf?.view.containerEl;
        const content = el?.querySelector<HTMLElement>('.mind-mapper-node-content');
        return {
          popout: el ? el.ownerDocument !== document : false,
          nodes: el?.querySelectorAll('.mind-mapper-node').length ?? 0,
          width: content?.offsetWidth ?? 0,
        };
      });
    await browser.waitUntil(async () => (await probe()).width > 0, {
      timeout: 15000,
      timeoutMsg: 'popout map did not render',
    });
    expect(await probe()).toMatchObject({ popout: true, nodes: 7 });

    const panned = await browser.executeObsidian(({ app }) => {
      const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
      const view = leaf?.view;
      const canvas = view?.containerEl.querySelector<HTMLElement>('.mind-mapper-canvas');
      const world = view?.containerEl.querySelector<HTMLElement>('.mind-mapper-world');
      if (!canvas || !world) return null;
      const before = world.style.transform;
      const Wheel = (canvas.win as unknown as typeof window).WheelEvent;
      canvas.dispatchEvent(
        new Wheel('wheel', { deltaX: 50, deltaY: 30, bubbles: true, cancelable: true }),
      );
      return before !== world.style.transform;
    });
    expect(panned).toBe(true);

    const fullScreen = await browser.executeObsidian(({ app }) => {
      const [leaf] = app.workspace.getLeavesOfType('mind-mapper-view');
      const view = leaf?.view as unknown as {
        contentEl: HTMLElement;
        toggleFullScreen(): void;
      };
      view.toggleFullScreen();
      const doc = view.contentEl.ownerDocument;
      const result = {
        inPopout: doc.body.querySelector('.mind-mapper-full-screen') !== null,
        inMain: document.body.querySelector('.mind-mapper-full-screen') !== null,
      };
      view.toggleFullScreen();
      leaf?.detach();
      return result;
    });
    expect(fullScreen).toEqual({ inPopout: true, inMain: false });
  });
});
