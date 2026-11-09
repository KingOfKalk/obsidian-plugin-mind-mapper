import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, waitForAnimation, writeNote } from '../helpers';

/**
 * Smooth camera (issue #24) in real Obsidian: fit, zoom controls, Back to root and layout switches
 * glide and end where the instant action (reduced motion) puts the view; wheel input stays instant.
 */

const NOTE = 'camera.md';
const TEXT = [
  '---',
  'mind-mapper-layout: left-to-right',
  '---',
  '# Project',
  '',
  '## Tasks',
  '',
  '- Plan',
  '- Build',
  '- Test',
  '',
  '## Notes',
  '',
  'Some text.',
  '',
  '## Ideas',
  '',
].join('\n');

interface Transform {
  x: number;
  y: number;
  zoom: number;
}

/** Moved away from the fit, the map still in view. */
const START: Transform = { x: 40, y: 30, zoom: 0.6 };

/** The map's CSS transform (pan and zoom) as shown. */
function worldTransform(): Promise<string> {
  return browser.execute(
    () => document.querySelector<HTMLElement>('.mind-mapper-world')?.style.transform ?? '',
  );
}

async function setStart(): Promise<void> {
  await browser.executeObsidian(({ app }, t) => {
    const view = app.workspace.getLeavesOfType('mind-mapper-view')[0]?.view as unknown as {
      setTransform(t: unknown): void;
    };
    view.setTransform(t);
  }, START);
}

/** Emulates the OS setting "reduce motion" (the view asks its window's matchMedia). */
async function reduceMotion(on: boolean): Promise<void> {
  await browser.execute((enable) => {
    const store = window as unknown as Record<string, typeof window.matchMedia | undefined>;
    if (enable) {
      const original = (store.mindMapperMatchMedia ??= window.matchMedia.bind(window));
      window.matchMedia = (query: string) =>
        query === '(prefers-reduced-motion: reduce)'
          ? ({ matches: true, media: query } as MediaQueryList)
          : original(query);
    } else if (store.mindMapperMatchMedia) {
      window.matchMedia = store.mindMapperMatchMedia;
      delete store.mindMapperMatchMedia;
    }
  }, on);
}

/**
 * Records what the next action shows: whether the canvas had `is-animating`, the transforms and
 * opacities of the map on the way.
 */
async function record(): Promise<void> {
  await browser.execute(() => {
    const canvas = document.querySelector('.mind-mapper-canvas');
    const world = document.querySelector<HTMLElement>('.mind-mapper-world');
    if (!canvas || !world) throw new Error('no map');
    const seen = {
      animating: false,
      transforms: [world.style.transform],
      opacities: [] as string[],
    };
    const observer = new MutationObserver(() => {
      if (canvas.classList.contains('is-animating')) seen.animating = true;
      if (seen.transforms.at(-1) !== world.style.transform) {
        seen.transforms.push(world.style.transform);
      }
      if (world.style.opacity !== '') seen.opacities.push(world.style.opacity);
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['class'] });
    observer.observe(world, { attributes: true, attributeFilter: ['style'] });
    (window as unknown as Record<string, unknown>).mindMapperSeen = { seen, observer };
  });
}

/** Ends recording; what it saw. */
async function recorded(): Promise<{
  animating: boolean;
  transforms: string[];
  opacities: string[];
}> {
  return browser.execute(() => {
    const store = window as unknown as Record<string, unknown>;
    const recording = store.mindMapperSeen as {
      seen: { animating: boolean; transforms: string[]; opacities: string[] };
      observer: MutationObserver;
    };
    recording.observer.disconnect();
    delete store.mindMapperSeen;
    return recording.seen;
  });
}

/** Makes the map leaf the active one (as after a click into it): its commands are available. */
async function focusMap(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getLeavesOfType('mind-mapper-view')[0];
    if (!leaf) throw new Error('no map');
    app.workspace.setActiveLeaf(leaf, { focus: true });
  });
}

async function control(label: string): Promise<void> {
  await browser.$(`.mind-mapper-controls button[aria-label="${label}"]`).click();
}

async function clickMenuItem(title: string): Promise<void> {
  await browser.$('.menu').waitForExist({ timeout: 5000 });
  for (const el of await browser.$$('.menu .menu-item')) {
    if ((await el.$('.menu-item-title').getText()) !== title) continue;
    await el.click();
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
    return;
  }
  throw new Error(`no menu item ${title}`);
}

/** A viewport point on the empty canvas: not on a node, toggle or the controls. */
async function emptyPoint(): Promise<{ x: number; y: number }> {
  const point = await browser.execute(() => {
    const canvas = document.querySelector('.mind-mapper-canvas')?.getBoundingClientRect();
    if (!canvas) return null;
    for (let fy = 0.2; fy < 0.8; fy += 0.05) {
      for (let fx = 0.1; fx < 0.9; fx += 0.05) {
        const x = Math.round(canvas.left + canvas.width * fx);
        const y = Math.round(canvas.top + canvas.height * fy);
        const hit = document.elementFromPoint(x, y);
        if (
          hit?.closest('.mind-mapper-canvas') &&
          !hit.closest('.mind-mapper-node, .mind-mapper-collapse, .mind-mapper-controls')
        ) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (!point) throw new Error('no empty point on the canvas');
  return point;
}

const ACTIONS: [string, () => Promise<void>][] = [
  ['Fit to view (button)', () => control('Fit to view')],
  ['Fit to view (command)', () => browser.executeObsidianCommand('mind-mapper:fit-to-view')],
  [
    'Fit to view (double click on the empty canvas)',
    async () => {
      const { x, y } = await emptyPoint();
      await browser
        .action('pointer')
        .move({ x, y, origin: 'viewport' })
        .down()
        .up()
        .pause(50)
        .down()
        .up()
        .perform();
    },
  ],
  ['Zoom in (button)', () => control('Zoom in')],
  ['Zoom out (command)', () => browser.executeObsidianCommand('mind-mapper:zoom-out')],
  ['Reset zoom (command)', () => browser.executeObsidianCommand('mind-mapper:reset-zoom')],
  [
    'a zoom preset',
    async () => {
      await control('Zoom presets');
      await clickMenuItem('75%');
    },
  ],
  [
    'a typed zoom',
    async () => {
      await browser.$('.mind-mapper-zoom-input').click();
      await browser.keys(['1', '2', '9', 'Enter']);
    },
  ],
  ['Back to root (command)', () => browser.executeObsidianCommand('mind-mapper:back-to-root')],
];

describe('smooth camera', function () {
  this.timeout(60000);

  beforeEach(async function () {
    await writeNote(NOTE, TEXT);
    await openMindMap(NOTE);
    await settle();
    await focusMap();
  });

  afterEach(async function () {
    await reduceMotion(false);
  });

  for (const [name, act] of ACTIONS) {
    it(`${name} glides to where it put the view at once before`, async function () {
      // The instant result (reduced motion: the behaviour before issue #24).
      await setStart();
      await reduceMotion(true);
      await record();
      await act();
      const instant = await recorded();
      await reduceMotion(false);
      expect(instant.animating).toBe(false);
      const target = await worldTransform();
      expect(target).not.toBe(instant.transforms[0]);

      await setStart();
      // A focused zoom field would take the next click as a caret position.
      await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur());
      await record();
      await act();
      await waitForAnimation();
      const glided = await recorded();
      expect(glided.animating).toBe(true);
      // Frames on the way, then exactly the instant result.
      expect(glided.transforms.length).toBeGreaterThan(2);
      expect(await worldTransform()).toBe(target);
    });
  }

  it('a layout switch cross-fades and glides to the new fit; with reduced motion at once', async function () {
    await setStart();
    await record();
    await control('Layout');
    await clickMenuItem('Top → bottom');
    await settle();
    const seen = await recorded();
    expect(seen.animating).toBe(true);
    expect(seen.opacities.some((o) => Number(o) < 1)).toBe(true);
    await focusMap();
    // Ends fully shown and fitted: Fit to view changes nothing.
    expect(
      await browser.execute(
        () => document.querySelector<HTMLElement>('.mind-mapper-world')?.style.opacity,
      ),
    ).toBe('');
    const shown = await worldTransform();
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await waitForAnimation();
    expect(await worldTransform()).toBe(shown);

    await setStart();
    await reduceMotion(true);
    await record();
    await browser.executeObsidianCommand('mind-mapper:next-layout');
    await settle();
    const instant = await recorded();
    expect(instant.animating).toBe(false);
    expect(instant.opacities).toEqual([]);
    const fitted = await worldTransform();
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    expect(await worldTransform()).toBe(fitted);
  });

  it('wheel input during a glide ends it and applies to the final transform', async function () {
    await setStart();
    await reduceMotion(true);
    await browser.executeObsidianCommand('mind-mapper:fit-to-view');
    await reduceMotion(false);
    const fit = await browser.executeObsidian(({ app }) => {
      const view = app.workspace.getLeavesOfType('mind-mapper-view')[0]?.view as unknown as {
        getTransform(): { x: number; y: number; zoom: number };
      };
      return view.getTransform();
    });
    await setStart();
    const after = await browser.executeObsidian(({ app }) => {
      const commands = (app as unknown as { commands: { executeCommandById(id: string): void } })
        .commands;
      commands.executeCommandById('mind-mapper:fit-to-view');
      const canvas = document.querySelector('.mind-mapper-canvas');
      const gliding = canvas?.classList.contains('is-animating') ?? false;
      canvas?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }),
      );
      const view = app.workspace.getLeavesOfType('mind-mapper-view')[0]?.view as unknown as {
        transform: { x: number; y: number; zoom: number };
      };
      return {
        gliding,
        animating: canvas?.classList.contains('is-animating') ?? true,
        transform: view.transform,
      };
    });
    expect(after).toEqual({
      gliding: true,
      animating: false,
      transform: { ...fit, y: fit.y - 100 },
    });
  });
});
