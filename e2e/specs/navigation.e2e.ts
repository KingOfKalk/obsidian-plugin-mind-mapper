import { browser, expect } from '@wdio/globals';
import {
  byId,
  leafSummary,
  mouseOnNode,
  openMindMap,
  openNote,
  settle,
  waitForAnimation,
} from '../helpers';

const CANVAS = '.mind-mapper-canvas';

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

  it('do not show through nodes without a box (root, level 3)', async function () {
    await openMindMap('fixtures/crosslinks.md');
    await settle();
    const probe = await browser.execute(() => {
      const canvasColor = (): string => {
        const el = document.body.appendChild(document.createElement('div'));
        el.style.color = 'var(--background-primary)';
        const color = getComputedStyle(el).color;
        el.remove();
        return color;
      };
      const root = document.querySelector<HTMLElement>('.mind-mapper-node.is-root');
      const plain = document.querySelector<HTMLElement>(
        '.mind-mapper-node[data-level="3"]:not(.is-block)',
      );
      const r = root?.getBoundingClientRect();
      if (!root || !plain || !r) return null;
      // a point of a link line inside the root's box: the root is on top there
      let onRoot: boolean | null = null;
      for (const path of Array.from(
        document.querySelectorAll<SVGPathElement>('path.mind-mapper-crosslink'),
      )) {
        const matrix = path.getScreenCTM();
        if (!matrix || onRoot !== null) continue;
        const length = path.getTotalLength();
        for (let i = 1; i < 200 && onRoot === null; i++) {
          const q = path.getPointAtLength((length * i) / 200);
          const p = new DOMPoint(q.x, q.y).matrixTransform(matrix);
          if (p.x > r.left + 2 && p.x < r.right - 2 && p.y > r.top + 2 && p.y < r.bottom - 2) {
            onRoot = root.contains(document.elementFromPoint(p.x, p.y));
          }
        }
      }
      return {
        onRoot,
        root: getComputedStyle(root).backgroundColor,
        plain: getComputedStyle(plain).backgroundColor,
        canvas: canvasColor(),
      };
    });
    if (!probe) throw new Error('no root or level 3 node');
    // the fixture has a line crossing the root (circle layout)
    expect(probe.onRoot).toBe(true);
    // opaque in the canvas colour: no box to see, but lines behind it are covered
    expect(probe.root).toBe(probe.canvas);
    expect(probe.plain).toBe(probe.canvas);
  });
});

/**
 * A viewport point on the link line from `fromId` to `toId` where its hit path is the topmost
 * element (not covered by a node, a toggle or another line).
 */
async function linkLinePoint(fromId: string, toId: string): Promise<{ x: number; y: number }> {
  const point = await browser.execute(
    (from, to) => {
      const hit = document.querySelector<SVGPathElement>(
        `.mind-mapper-crosslink-hit[data-from-id="${from}"][data-to-id="${to}"]`,
      );
      const matrix = hit?.getScreenCTM();
      if (!hit || !matrix) return null;
      const length = hit.getTotalLength();
      for (let f = 0.5; f > 0.05; f -= 0.05) {
        for (const at of [f, 1 - f]) {
          const p = new DOMPoint(
            hit.getPointAtLength(length * at).x,
            hit.getPointAtLength(length * at).y,
          ).matrixTransform(matrix);
          const x = Math.round(p.x);
          const y = Math.round(p.y);
          if (document.elementFromPoint(x, y) === hit) return { x, y };
        }
      }
      return null;
    },
    fromId,
    toId,
  );
  if (!point) throw new Error(`no free point on the link line ${fromId} -> ${toId}`);
  return point;
}

function linkEnds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node.is-link-end'))
      .map((el) => el.dataset.nodeId ?? '')
      .sort(),
  );
}

function highlightedLines(): Promise<number> {
  return browser.execute(
    () => document.querySelectorAll('path.mind-mapper-crosslink.is-highlighted').length,
  );
}

describe('clicking a link line', function () {
  it('rings both end nodes in the accent colour; a node selection highlights no links', async function () {
    await openMindMap('fixtures/crosslinks.md');
    await settle();
    const { x, y } = await linkLinePoint('Links/Gamma/#1', 'Links/Beta/Inner');
    // hover: pointer cursor and a slightly thicker line
    await browser.action('pointer').move({ x, y, origin: 'viewport' }).perform();
    const hover = await browser.execute(() => {
      const hit = document.querySelector(
        '.mind-mapper-crosslink-hit[data-from-id="Links/Gamma/#1"][data-to-id="Links/Beta/Inner"]',
      );
      const line = hit?.previousElementSibling;
      return {
        cursor: hit ? getComputedStyle(hit).cursor : '',
        width: line ? getComputedStyle(line).strokeWidth : '',
        dashed: line ? getComputedStyle(line).strokeDasharray !== 'none' : false,
      };
    });
    expect(hover).toEqual({ cursor: 'pointer', width: '2.5px', dashed: true });
    await browser.action('pointer').move({ x, y, origin: 'viewport' }).down().up().perform();
    await browser.waitUntil(async () => (await linkEnds()).length === 2, {
      timeout: 5000,
      timeoutMsg: 'a click on the line did not highlight its ends',
    });
    expect(await linkEnds()).toEqual(['Links/Beta/Inner', 'Links/Gamma/#1']);
    expect(await highlightedLines()).toBe(1);
    // still a link (dashed), not a tree edge: only thicker
    const line = await browser.execute(() => {
      const el = document.querySelector('path.mind-mapper-crosslink.is-highlighted');
      const style = el ? getComputedStyle(el) : null;
      return { dash: style?.strokeDasharray ?? '', width: style?.strokeWidth ?? '' };
    });
    expect(line.dash).not.toBe('none');
    expect(line.dash).not.toBe('');
    expect(line.width).toBe('3px');
    // a copy of it is drawn above every node (all other lines stay behind the nodes)
    const overlay = await browser.execute(() => {
      const path = document.querySelector<SVGPathElement>(
        'svg.mind-mapper-highlight-layer path.mind-mapper-crosslink-highlight',
      );
      if (!path) return null;
      const style = getComputedStyle(path);
      return {
        aboveNodes: Array.from(document.querySelectorAll('.mind-mapper-node')).every(
          (node) => (node.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        ),
        d: path.getAttribute('d'),
        lineD: document
          .querySelector('path.mind-mapper-crosslink.is-highlighted')
          ?.getAttribute('d'),
        dash: style.strokeDasharray,
        width: style.strokeWidth,
        pointerEvents: path.ownerSVGElement
          ? getComputedStyle(path.ownerSVGElement).pointerEvents
          : '',
      };
    });
    expect(overlay).not.toBeNull();
    expect(overlay?.aboveNodes).toBe(true);
    expect(overlay?.d).toBe(overlay?.lineD);
    expect(overlay?.dash).not.toBe('none');
    expect(overlay?.dash).not.toBe('');
    expect(overlay?.width).toBe('3px');
    expect(overlay?.pointerEvents).toBe('none');
    // the same ring as a selected node, in the accent colour
    const ring = await browser.execute(() => {
      const el = document.querySelector('.mind-mapper-node.is-link-end');
      const accent = getComputedStyle(document.body).getPropertyValue('--interactive-accent');
      const probe = document.body.appendChild(document.createElement('div'));
      probe.style.color = accent;
      const color = getComputedStyle(probe).color;
      probe.remove();
      return { shadow: el ? getComputedStyle(el).boxShadow : '', color };
    });
    expect(ring.shadow).toContain(ring.color);
    expect(ring.shadow).toContain('2px');

    await mouseOnNode('Links/Alpha', 'click');
    await expect(browser.$('.mind-mapper-node[data-node-id="Links/Alpha"]')).toHaveElementClass(
      'is-selected',
    );
    expect(await linkEnds()).toEqual([]);
    expect(await highlightedLines()).toBe(0);
    await expect(browser.$('svg.mind-mapper-highlight-layer')).not.toExist();
  });

  it('a double click on a line puts the cursor on the line the link is written on', async function () {
    await openNote('fixtures/crosslinks.md');
    await openMindMap('fixtures/crosslinks.md');
    await settle();
    // a small pan: the map is no longer fitted, the line stays in view
    await browser.execute((canvasSelector) => {
      document
        .querySelector(canvasSelector)
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaX: 20, deltaY: 15, bubbles: true, cancelable: true }),
        );
    }, CANVAS);
    const before = await worldTransform();
    await doubleClickAt(await linkLinePoint('Links/Gamma/#1', 'Links/Beta/Inner'));
    await browser.waitUntil(
      () =>
        browser.executeObsidian(({ app, obsidian }) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          return view?.editor.getCursor().line === 14;
        }),
      { timeout: 10000, timeoutMsg: 'cursor is not on the line of [[#Beta#Inner]] (line 14)' },
    );
    // no fit: a double click on a line is not one on the empty canvas
    expect(await worldTransform()).toBe(before);
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
    // It glides there.
    await waitForAnimation();
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

/** Pans and zooms so that most of the map is out of view (wheel events, like a trackpad). */
async function panAway(): Promise<void> {
  await browser.execute((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector);
    const wheel = (init: WheelEventInit) =>
      canvas?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));
    wheel({ deltaY: -400, ctrlKey: true });
    wheel({ deltaX: 900, deltaY: 600 });
  }, CANVAS);
}

/**
 * Layout nodes whose screen rect is not inside the canvas rect (1 px tolerance). From the layout
 * and the transform, not the DOM: culling removes the DOM of nodes out of view.
 */
function nodesOutsideCanvas(): Promise<string[]> {
  return browser.executeObsidian(({ app }) => {
    type Rect = { x: number; y: number; width: number; height: number };
    const view = app.workspace
      .getLeavesOfType('mind-mapper-view')
      .map(
        (leaf) =>
          leaf.view as unknown as {
            contentEl: HTMLElement;
            layout: { nodes: (Rect & { node: { id: string } })[] } | null;
            getTransform(): { x: number; y: number; zoom: number };
          },
      )
      .find((v) => (v.contentEl.querySelector('.mind-mapper-canvas')?.clientWidth ?? 0) > 0);
    const canvas = view?.contentEl.querySelector('.mind-mapper-canvas')?.getBoundingClientRect();
    if (!view?.layout || !canvas) return ['no map'];
    const t = view.getTransform();
    return view.layout.nodes
      .filter((p) => {
        const left = canvas.left + p.x * t.zoom + t.x;
        const top = canvas.top + p.y * t.zoom + t.y;
        return (
          left < canvas.left - 1 ||
          top < canvas.top - 1 ||
          left + p.width * t.zoom > canvas.right + 1 ||
          top + p.height * t.zoom > canvas.bottom + 1
        );
      })
      .map((p) => p.node.id);
  });
}

/** A viewport point on the empty canvas: not on a node, toggle or the controls. */
async function emptyPoint(): Promise<{ x: number; y: number }> {
  const point = await browser.execute((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector)?.getBoundingClientRect();
    if (!canvas) return null;
    for (let fy = 0.2; fy < 0.8; fy += 0.05) {
      for (let fx = 0.1; fx < 0.9; fx += 0.05) {
        const x = Math.round(canvas.left + canvas.width * fx);
        const y = Math.round(canvas.top + canvas.height * fy);
        const hit = document.elementFromPoint(x, y);
        if (
          hit?.closest(canvasSelector) &&
          !hit.closest('.mind-mapper-node, .mind-mapper-collapse, .mind-mapper-controls')
        ) {
          return { x, y };
        }
      }
    }
    return null;
  }, CANVAS);
  if (!point) throw new Error('no empty point on the canvas');
  return point;
}

/** A real mouse double click (pointer and click events from the browser). */
async function doubleClickAt({ x, y }: { x: number; y: number }): Promise<void> {
  await browser
    .action('pointer')
    .move({ x, y, origin: 'viewport' })
    .down()
    .up()
    .pause(50)
    .down()
    .up()
    .perform();
}

describe('double click on the empty canvas', function () {
  it('fits the whole map into the canvas, also in full screen', async function () {
    await openMindMap('fixtures/worked-example.md');
    await settle();
    await panAway();
    expect((await nodesOutsideCanvas()).length).toBeGreaterThan(0);
    await doubleClickAt(await emptyPoint());
    await browser.waitUntil(async () => (await nodesOutsideCanvas()).length === 0, {
      timeout: 5000,
      timeoutMsg: 'double click did not fit the map',
    });

    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await panAway();
    expect((await nodesOutsideCanvas()).length).toBeGreaterThan(0);
    await doubleClickAt(await emptyPoint());
    await browser.waitUntil(async () => (await nodesOutsideCanvas()).length === 0, {
      timeout: 5000,
      timeoutMsg: 'double click did not fit the map in full screen',
    });
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
  });

  it('a real double click on a node still jumps to the source and does not fit', async function () {
    await openNote('fixtures/worked-example.md');
    await openMindMap('fixtures/worked-example.md');
    await settle();
    // a small pan: the map is no longer fitted, the node stays in view
    await browser.execute((canvasSelector) => {
      document
        .querySelector(canvasSelector)
        ?.dispatchEvent(
          new WheelEvent('wheel', { deltaX: 40, deltaY: 30, bubbles: true, cancelable: true }),
        );
    }, CANVAS);
    const before = await worldTransform();
    const center = await browser.execute(() => {
      const r = document
        .querySelector('.mind-mapper-node[data-node-id="Project/Tasks"] .mind-mapper-node-content')
        ?.getBoundingClientRect();
      return r
        ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        : null;
    });
    if (!center) throw new Error('node not found');
    await doubleClickAt(center);
    await browser.waitUntil(
      () =>
        browser.executeObsidian(({ app, obsidian }) => {
          const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
          return view?.editor.getCursor().line === 3;
        }),
      { timeout: 10000, timeoutMsg: 'cursor is not on "## Tasks" (line 3)' },
    );
    expect(await worldTransform()).toBe(before);
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
    await browser.$(byId('ribbon.open-mind-map')).click();
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
