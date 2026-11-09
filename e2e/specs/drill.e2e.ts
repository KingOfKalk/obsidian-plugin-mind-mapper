import { browser, expect } from '@wdio/globals';
import { mouseOnNode, openMindMap, openNote, settle, waitForCache, writeNote } from '../helpers';

/** Drill-down (issue #23) in real Obsidian. */

const NOTE = 'drill.md';
const TEXT = [
  '---',
  'mind-mapper-layout: left-to-right',
  '---',
  '# Project',
  '',
  '## Tasks',
  '',
  '### Phase 1',
  '',
  '- Plan',
  '',
  '### Phase 2',
  '',
  '- Build',
  '- Test',
  '',
  '## Notes',
  '',
  'See [[#Phase 2]].',
  '',
].join('\n');

const TASKS = 'Project/Tasks';
const PHASE_2 = 'Project/Tasks/Phase 2';
const TASKS_SUBTREE = [
  TASKS,
  'Project/Tasks/Phase 1',
  'Project/Tasks/Phase 1/#1',
  PHASE_2,
  'Project/Tasks/Phase 2/#1',
  'Project/Tasks/Phase 2/#2',
].sort();
const PHASE_2_SUBTREE = [PHASE_2, 'Project/Tasks/Phase 2/#1', 'Project/Tasks/Phase 2/#2'].sort();
const ALL = 9;

const drillButton = () => browser.$('.mind-mapper-controls button.mind-mapper-drill');

function shownIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node'))
      .map((el) => el.dataset.nodeId ?? '')
      .sort(),
  );
}

function selectedId(): Promise<string | null> {
  return browser.execute(
    () =>
      document.querySelector<HTMLElement>('.mind-mapper-node.is-selected')?.dataset.nodeId ?? null,
  );
}

function hasClass(selector: string, cls: string): Promise<boolean> {
  return browser.execute(
    (s, c) => document.querySelector(s)?.classList.contains(c) ?? false,
    selector,
    cls,
  );
}

/** Waits until a drill animation has run (glide, cross-fade) and the layout has settled. */
async function animationEnd(): Promise<void> {
  await browser.$('.mind-mapper-canvas.is-drilling').waitForExist({ reverse: true, timeout: 5000 });
  await settle();
}

/** Distance of the node's centre from the canvas centre, in screen px. */
function offCentre(id: string): Promise<number> {
  return browser.execute((nodeId) => {
    const canvas = document.querySelector('.mind-mapper-canvas')?.getBoundingClientRect();
    const node = document
      .querySelector(`.mind-mapper-node[data-node-id="${nodeId}"]`)
      ?.getBoundingClientRect();
    if (!canvas || !node) throw new Error(`no canvas or node ${nodeId}`);
    return Math.hypot(
      node.x + node.width / 2 - (canvas.x + canvas.width / 2),
      node.y + node.height / 2 - (canvas.y + canvas.height / 2),
    );
  }, id);
}

/** The note's bytes as hex and its modification time. */
async function noteFile(): Promise<{ bytes: string; mtime: number }> {
  return await browser.executeObsidian(async ({ app }, path) => {
    const file = app.vault.getFileByPath(path);
    if (!file) throw new Error(`no note ${path}`);
    const data = new Uint8Array(await app.vault.adapter.readBinary(path));
    return {
      bytes: Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(''),
      mtime: file.stat.mtime,
    };
  }, NOTE);
}

/** Makes the map leaf the active one (as after a click into it). */
async function focusMap(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.getLeavesOfType('mind-mapper-view')[0];
    if (!leaf) throw new Error('no map');
    app.workspace.setActiveLeaf(leaf, { focus: true });
  });
}

describe('drill-down', function () {
  beforeEach(async function () {
    await writeNote(NOTE, TEXT);
    await openMindMap(NOTE);
    await settle();
  });

  it('button and D drill in, stack and drill out; "Show the whole map" goes straight out; the note is unchanged', async function () {
    const before = await noteFile();
    expect(await shownIds()).toHaveLength(ALL);
    expect(await drillButton().isEnabled()).toBe(false);
    // The Lucide icons exist in this Obsidian version.
    expect(await drillButton().$('svg').isExisting()).toBe(true);
    // The same-note link from Notes to Phase 2.
    expect(await browser.$$('.mind-mapper-crosslink')).toHaveLength(1);

    // Button.
    await mouseOnNode(TASKS, 'click');
    expect(await drillButton().isEnabled()).toBe(true);
    await drillButton().click();
    // Animated: the glide and cross-fade run first.
    expect(await hasClass('.mind-mapper-canvas', 'is-drilling')).toBe(true);
    await animationEnd();
    expect(await shownIds()).toEqual(TASKS_SUBTREE);
    const centre = `.mind-mapper-node[data-node-id="${TASKS}"]`;
    expect(await hasClass(centre, 'is-root')).toBe(true);
    expect(await hasClass(centre, 'is-drill-centre')).toBe(true);
    expect(await browser.$('.mind-mapper-drill-marker svg').isExisting()).toBe(true);
    expect(await hasClass('.mind-mapper-controls button.mind-mapper-drill', 'is-active')).toBe(
      true,
    );
    // The link leads out of the drilled part: hidden.
    expect(await browser.$$('.mind-mapper-crosslink')).toHaveLength(0);

    // D, stacked.
    await mouseOnNode(PHASE_2, 'click');
    await focusMap();
    await browser.keys('d');
    await animationEnd();
    expect(await shownIds()).toEqual(PHASE_2_SUBTREE);

    // D with the centre selected: out one level, Phase 2 selected and centred.
    await browser.keys('d');
    await animationEnd();
    expect(await shownIds()).toEqual(TASKS_SUBTREE);
    expect(await selectedId()).toBe(PHASE_2);
    expect(await offCentre(PHASE_2)).toBeLessThan(2);

    await browser.executeObsidianCommand('mind-mapper:drill-down');
    await animationEnd();
    expect(await shownIds()).toEqual(PHASE_2_SUBTREE);
    await browser.executeObsidianCommand('mind-mapper:show-whole-map');
    await animationEnd();
    expect(await shownIds()).toHaveLength(ALL);
    expect(await selectedId()).toBe(TASKS);
    expect(await offCentre(TASKS)).toBeLessThan(2);
    expect(await browser.$('.mind-mapper-drill-marker').isExisting()).toBe(false);
    expect(await browser.$$('.mind-mapper-crosslink')).toHaveLength(1);
    expect(await noteFile()).toEqual(before);
  });

  it('the drill path survives an Obsidian restart', async function () {
    await mouseOnNode(TASKS, 'click');
    await browser.executeObsidianCommand('mind-mapper:drill-down');
    await animationEnd();
    await mouseOnNode(PHASE_2, 'click');
    await browser.executeObsidianCommand('mind-mapper:drill-down');
    await animationEnd();
    // Obsidian saves the workspace debounced.
    await browser.waitUntil(
      async () =>
        (
          await browser.executeObsidian(({ app }) =>
            app.vault.adapter.read('.obsidian/workspace.json'),
          )
        ).includes('"Project/Tasks/Phase 2"'),
      { timeout: 15000, timeoutMsg: 'the drill path was not saved in the workspace' },
    );

    await browser.reloadObsidian();
    await waitForCache(NOTE);
    await browser.executeObsidian(async ({ app }) => {
      const leaf = app.workspace.getLeavesOfType('mind-mapper-view')[0];
      if (!leaf) throw new Error('the map tab was not restored');
      await app.workspace.revealLeaf(leaf);
    });
    await browser.$('.mind-mapper-node.is-root').waitForExist({ timeout: 15000 });
    await settle();
    expect(await shownIds()).toEqual(PHASE_2_SUBTREE);
    expect(await hasClass(`.mind-mapper-node[data-node-id="${PHASE_2}"]`, 'is-drill-centre')).toBe(
      true,
    );
    await browser.executeObsidianCommand('mind-mapper:drill-out');
    await animationEnd();
    expect(await shownIds()).toEqual(TASKS_SUBTREE);
    await browser.executeObsidianCommand('mind-mapper:show-whole-map');
    await animationEnd();
  });

  it('with "reduce motion" it switches instantly', async function () {
    await mouseOnNode(TASKS, 'click');
    const instant = await browser.execute(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query === '(prefers-reduced-motion: reduce)'
          ? ({ matches: true, media: query } as MediaQueryList)
          : original(query);
      try {
        const button = document.querySelector<HTMLButtonElement>(
          '.mind-mapper-controls button.mind-mapper-drill',
        );
        button?.click();
        return {
          drilling: document.querySelector('.mind-mapper-canvas.is-drilling') !== null,
          nodes: document.querySelectorAll('.mind-mapper-node').length,
        };
      } finally {
        window.matchMedia = original;
      }
    });
    expect(instant).toEqual({ drilling: false, nodes: TASKS_SUBTREE.length });
    await browser.executeObsidianCommand('mind-mapper:show-whole-map');
    await animationEnd();
  });

  it('D typed in the editor types a "d" and does not drill', async function () {
    await mouseOnNode(TASKS, 'click');
    await openNote(NOTE);
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no editor');
      view.editor.focus();
      view.editor.setCursor(view.editor.lastLine(), 0);
    });
    await browser.keys('d');
    await browser.waitUntil(
      async () =>
        await browser.executeObsidian(
          ({ app, obsidian }) =>
            app.workspace
              .getActiveViewOfType(obsidian.MarkdownView)
              ?.editor.getValue()
              .endsWith('d') ?? false,
        ),
      { timeout: 5000, timeoutMsg: 'the editor did not get the d' },
    );
    // Live update: the map follows the note, not drilled in.
    await browser.pause(800);
    expect(await shownIds()).toHaveLength(ALL);
    expect(await browser.$('.mind-mapper-drill-marker').isExisting()).toBe(false);
  });
});
