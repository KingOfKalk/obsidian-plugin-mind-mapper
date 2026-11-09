import { browser, expect } from '@wdio/globals';
import { nodeBoxes, openMindMap, settle, writeNote } from '../helpers';

type MindMapper = {
  manifest: { version: string };
  settings: { maxNodeWidth: number };
  loadData(): Promise<{ maxNodeWidth?: number } | null>;
  updateSettings(patch: object): Promise<void>;
};

type ObsidianApp = {
  plugins: { plugins: Record<string, MindMapper> };
  setting: { close(): void };
  vault: { getConfig(key: string): unknown; setConfig(key: string, value: unknown): void };
};

/** The settings row with this name, in the open settings tab. */
function settingRow(name: string) {
  return browser.$(
    `//div[contains(concat(" ",@class," ")," setting-item ")][.//div[contains(@class,"setting-item-name") and normalize-space()="${name}"]]`,
  );
}

/** Obsidian 1.15 opens settings in a popout window by default; a modal in the main window is simpler to drive. */
function settingsPopout(value: unknown): Promise<unknown> {
  return browser.executeObsidian(({ app }, next) => {
    const vault = (app as unknown as ObsidianApp).vault;
    const previous = vault.getConfig('settingsPopoutWindow');
    vault.setConfig('settingsPopoutWindow', next);
    return previous;
  }, value);
}

async function nodeWidth(id: string): Promise<number> {
  return (await nodeBoxes()).find((box) => box.id === id)?.width ?? 0;
}

const NOTE = 'settings-wide.md';

describe('settings', function () {
  // A frozen renderer must fail fast, not after the default two minutes per test.
  this.timeout(45000);
  let popout: unknown;

  before(async function () {
    popout = await settingsPopout(false);
    await writeNote(
      NOTE,
      `# Wide\n\n${'A long paragraph that wraps at the max node width. '.repeat(12)}\n`,
    );
  });

  after(async function () {
    await browser.executeObsidian(({ app }) => (app as unknown as ObsidianApp).setting.close());
    await settingsPopout(popout);
    await browser.executeObsidian(async ({ app }) => {
      await (app as unknown as ObsidianApp).plugins.plugins['mind-mapper']!.updateSettings({
        maxNodeWidth: 320,
      });
    });
  });

  it('settings search finds a Mind Mapper setting and opens its tab', async function () {
    await browser.executeObsidianCommand('app:open-settings');
    const search = browser.$('.mod-settings .setting-search-container input');
    await search.waitForDisplayed();
    await search.setValue('Max node width');

    const result = browser.$(
      '//div[contains(@class,"setting-search-result-group")][.//div[contains(@class,"setting-search-result-tab-label") and normalize-space()="Mind Mapper"]]//div[contains(@class,"setting-search-result-item")][normalize-space()="Max node width"]',
    );
    await result.waitForDisplayed();
    await result.click();

    await settingRow('Max node width').waitForDisplayed();
    for (const name of ['Default layout', 'Max node height', 'Sibling gap', 'Level gap']) {
      expect(await settingRow(name).isExisting()).toBe(true);
    }
    for (const heading of ['Map', 'Nodes', 'Spacing', 'About']) {
      const el = browser.$(
        `//div[contains(@class,"setting-item-heading")][.//div[contains(@class,"setting-item-name") and normalize-space()="${heading}"]]`,
      );
      expect(await el.isExisting()).toBe(true);
    }
    await browser.executeObsidian(({ app }) => (app as unknown as ObsidianApp).setting.close());
  });

  it('moving a slider saves the value and re-lays out the open map', async function () {
    await openMindMap(NOTE);
    await settle();
    expect(await nodeWidth('Wide/#1')).toBeLessThanOrEqual(320);

    await openMindMapperSettings();
    const slider = settingRow('Max node width').$('input[type="range"]');
    await slider.waitForDisplayed();
    expect(await slider.getValue()).toBe('320');
    expect(await settingRow('Max node width').$('.slider-value').getText()).toBe('320 px');

    // Like a user with the keyboard: the browser fires `input` and `change` itself.
    await browser.execute((el) => el.focus(), await slider.getElement());
    await browser.keys('ArrowRight');
    await browser.waitUntil(
      async () => (await settingRow('Max node width').$('.slider-value').getText()) === '330 px',
      { timeout: 5000, timeoutMsg: 'the slider does not show the new value' },
    );
    await browser.keys('End');
    await browser.waitUntil(async () => (await slider.getValue()) === '800', {
      timeout: 5000,
      timeoutMsg: 'the slider does not move to its maximum',
    });

    await browser.waitUntil(async () => (await savedMaxNodeWidth()).data === 800, {
      timeout: 5000,
      timeoutMsg: 'the slider value is not saved',
    });
    expect(await savedMaxNodeWidth()).toEqual({ settings: 800, data: 800 });

    await settle();
    expect(await nodeWidth('Wide/#1')).toBeGreaterThan(320);
  });

  it('the About group shows the plugin version and the repository link', async function () {
    await openMindMapperSettings();
    const version = await browser.executeObsidian(
      ({ app }) => (app as unknown as ObsidianApp).plugins.plugins['mind-mapper']!.manifest.version,
    );
    const row = settingRow('Version');
    await row.waitForDisplayed();
    expect(await row.$('.setting-item-description').getText()).toBe(version);
    const link = settingRow('Source code').$('.setting-item-description a');
    expect(await link.getAttribute('href')).toBe(
      'https://github.com/KingOfKalk/obsidian-plugin-mind-mapper',
    );
  });
});

async function openMindMapperSettings(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } })
      .setting;
    setting.open();
    setting.openTabById('mind-mapper');
  });
}

async function savedMaxNodeWidth(): Promise<{ settings: number; data: number | undefined }> {
  return await browser.executeObsidian(async ({ app }) => {
    const plugin = (app as unknown as ObsidianApp).plugins.plugins['mind-mapper']!;
    return {
      settings: plugin.settings.maxNodeWidth,
      data: (await plugin.loadData())?.maxNodeWidth,
    };
  });
}
