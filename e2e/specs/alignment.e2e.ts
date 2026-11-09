import { browser, expect } from '@wdio/globals';
import { openMindMap, settle, writeNote } from '../helpers';

const NOTE = 'alignment.md';
const ROOT = 'Central topic that is long enough to wrap onto two lines';
const TEXT = [
  `# ${ROOT}`,
  '',
  '## Right one',
  '',
  'First line<br>second, a longer line',
  '',
  '## Right two',
  '',
  '- An item<br>that wraps',
  '',
  '## Left one',
  '',
  'Left paragraph<br>with a much longer second line',
  '',
  '## Left two',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
].join('\n');

/** Nodes checked; balanced maps put "Right …" on the right and "Left …" on the left. */
const NODES = {
  root: ROOT,
  rightText: `${ROOT}/Right one/#1`,
  rightItem: `${ROOT}/Right two/#1`,
  leftHeading: `${ROOT}/Left one`,
  leftText: `${ROOT}/Left one/#1`,
  code: `${ROOT}/Left two/#1`,
};

type Aligns = Record<keyof typeof NODES, string>;

/** Computed `text-align` of the first element of each node's content. */
function aligns(): Promise<Aligns> {
  return browser.execute((nodes) => {
    const result: Record<string, string> = {};
    for (const [key, id] of Object.entries(nodes)) {
      const content = Array.from(document.querySelectorAll<HTMLElement>('.mind-mapper-node'))
        .find((el) => el.dataset.nodeId === id)
        ?.querySelector('.mind-mapper-node-content');
      const first = content?.firstElementChild;
      result[key] = first ? getComputedStyle(first).textAlign : `no content for ${id}`;
    }
    return result as Aligns;
  }, NODES);
}

/** Expected alignments: root, nodes on the right side, nodes on the left side; code never changes. */
function expected(root: string, right: string, left: string): Aligns {
  return {
    root,
    rightText: right,
    rightItem: right,
    leftHeading: left,
    leftText: left,
    code: 'start',
  };
}

const BY_LAYOUT: Record<string, Aligns> = {
  'circle-clockwise': expected('center', 'left', 'right'),
  'circle-counter-clockwise': expected('center', 'right', 'left'),
  'left-to-right': expected('right', 'left', 'left'),
  'right-to-left': expected('left', 'right', 'right'),
  'top-to-bottom': expected('center', 'center', 'center'),
  'bottom-to-top': expected('center', 'center', 'center'),
};

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

async function setLayoutFrontmatter(layout: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path, value) => {
      const file = app.vault.getFileByPath(path);
      if (!file) throw new Error(`no note ${path}`);
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        frontmatter['mind-mapper-layout'] = value;
      });
    },
    NOTE,
    layout,
  );
}

/** Opens the control bar's layout menu and clicks `item`. */
async function chooseLayout(item: string): Promise<void> {
  await browser.$('.mind-mapper-controls button[aria-label="Layout"]').click();
  await browser.$('.menu').waitForExist({ timeout: 5000 });
  for (const el of await browser.$$('.menu .menu-item')) {
    if ((await el.$('.menu-item-title').getText()) !== item) continue;
    await el.click();
    await browser.$('.menu').waitForExist({ reverse: true, timeout: 5000 });
    return;
  }
  throw new Error(`no menu item ${item}`);
}

async function expectAligns(layout: string): Promise<void> {
  await settle();
  expect({ layout, ...(await aligns()) }).toEqual({ layout, ...BY_LAYOUT[layout] });
}

describe('text alignment', function () {
  beforeEach(async function () {
    await writeNote(NOTE, TEXT);
  });

  after(async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise' });
  });

  it('follows the side of the map in every layout (setting); blocks keep theirs', async function () {
    await openMindMap(NOTE);
    for (const layout of Object.keys(BY_LAYOUT)) {
      await updateSettings({ defaultLayout: layout });
      await expectAligns(layout);
    }
  });

  it('follows a frontmatter layout, the control-bar switcher and stays in full screen', async function () {
    await updateSettings({ defaultLayout: 'circle-clockwise' });
    await openMindMap(NOTE);
    await expectAligns('circle-clockwise');
    await setLayoutFrontmatter('left-to-right');
    await browser.waitUntil(async () => (await aligns()).root === 'right', {
      timeout: 10000,
      timeoutMsg: 'the frontmatter layout did not change the alignment',
    });
    await expectAligns('left-to-right');
    await chooseLayout('Right → left');
    await expectAligns('right-to-left');
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).toExist();
    await expectAligns('right-to-left');
    await chooseLayout('Top → bottom');
    await expectAligns('top-to-bottom');
    await browser.executeObsidianCommand('mind-mapper:toggle-full-screen');
    await expect(browser.$('.mind-mapper-full-screen')).not.toExist();
    await expectAligns('top-to-bottom');
  });
});
