import { browser, expect } from '@wdio/globals';
import { openMindMap, setObsidianLanguage, settle } from '../helpers';

function controlLabels(): Promise<(string | null)[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('.mind-mapper-controls button')).map((b) =>
      b.getAttribute('aria-label'),
    ),
  );
}

describe('language', function () {
  after(async function () {
    await setObsidianLanguage(null);
  });

  it('follows Obsidian set to German: controls, commands and title are German', async function () {
    await setObsidianLanguage('de');
    expect(await browser.executeObsidian(({ obsidian }) => obsidian.getLanguage())).toBe('de');

    await openMindMap('fixtures/worked-example.md');
    await settle();
    expect(await controlLabels()).toEqual([
      'Verkleinern',
      'Zoomvorgaben',
      'Vergrößern',
      'An Ansicht anpassen',
      'Alle einklappen',
      'Zurück zum Hauptthema',
      'In die Auswahl eintauchen',
      'Layout',
      'Farbschema',
      'Vollbild umschalten',
    ]);
    expect(await browser.$('.mind-mapper-zoom-input').getAttribute('aria-label')).toBe('Zoomstufe');
    expect(await browser.$('.mind-mapper-zoom-input').getValue()).toMatch(/^\d+\u00a0%$/);
    const command = await browser.executeObsidian(
      ({ app }) =>
        (app as unknown as { commands: { commands: Record<string, { name: string }> } }).commands
          .commands['mind-mapper:open-as-mind-map']?.name,
    );
    // Obsidian prefixes the plugin name.
    expect(command).toBe('Mind Mapper: Als Mindmap öffnen');
  });
});
