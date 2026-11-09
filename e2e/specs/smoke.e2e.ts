import { browser, expect } from '@wdio/globals';
import { openViaCommand } from '../helpers';

describe('smoke', function () {
  it('plugin is enabled', async function () {
    const enabled = await browser.executeObsidian(
      ({ app }) =>
        'mind-mapper' in (app as unknown as { plugins: { plugins: object } }).plugins.plugins,
    );
    expect(enabled).toBe(true);
  });

  it('worked example opens as a mind map', async function () {
    await openViaCommand('fixtures/worked-example.md');
    expect(await browser.$$('.mind-mapper-node').length).toBe(7);
  });
});
