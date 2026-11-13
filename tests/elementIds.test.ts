import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ELEMENT_STATES, setElementState } from '../src/elementIds';
import MindMapperPlugin from '../src/main';
import { FakeWorkspace, fakeApp, fakeManifest } from './helpers';
import type { MockSettingDefinition, Plugin as MockPlugin } from './mocks/obsidian';

/**
 * Keeps docs/ui-elements.md and the code in sync (issue #33). DOM IDs: the `ElementId` union in
 * src/elementIds.ts (the only way to set `data-mm-id`) against the catalog, and every member used
 * in src/. Commands, settings rows, notices, placeholder messages and frontmatter keys: against
 * their own sources. Menus and the file menu item are rendered by Obsidian and only catalogued.
 */

const CATALOG = readFileSync('docs/ui-elements.md', 'utf8');
/** Catalog entries without `data-mm-id` in the DOM, by ID prefix. */
const NOT_IN_DOM = [
  'command.',
  'settings.',
  'notice.',
  'message.',
  'frontmatter.',
  'menu.',
  'file-menu.',
];

function catalogIds(): string[] {
  return [...CATALOG.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1] ?? '');
}

function catalogIdsWith(prefix: string): string[] {
  return catalogIds().filter((id) => id.startsWith(prefix));
}

function sourceFiles(dir = 'src'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

/** The members of `type ElementId = ...;` in src/elementIds.ts. */
function elementIdUnion(): string[] {
  const block = /export type ElementId =([^;]*);/.exec(source('src/elementIds.ts'))?.[1] ?? '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();

const sorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

test('catalog IDs are unique and dotted kebab-case', () => {
  const ids = catalogIds();
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.length).toBe(new Set(ids).size);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/);
});

test('every DOM element ID in the code is in the catalog and vice versa', () => {
  const dom = catalogIds().filter((id) => !NOT_IN_DOM.some((prefix) => id.startsWith(prefix)));
  expect(sorted(elementIdUnion())).toEqual(sorted(dom));
});

test('every element ID is set somewhere in src/', () => {
  const code = sourceFiles()
    .filter((path) => path !== join('src', 'elementIds.ts'))
    .map(source)
    .join('\n');
  const unused = elementIdUnion().filter((id) => !code.includes(`'${id}'`));
  expect(unused).toEqual([]);
});

test('data-mm-id is only written by src/elementIds.ts', () => {
  const others = sourceFiles().filter(
    (path) => path !== join('src', 'elementIds.ts') && source(path).includes('data-mm-id'),
  );
  expect(others).toEqual([]);
});

/** States per ID from the "States" column of the catalog tables (backticked values). */
function catalogStates(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  let column = -1;
  for (const line of CATALOG.split('\n')) {
    if (!line.startsWith('|')) {
      column = -1;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells[0] === 'ID') {
      column = cells.indexOf('States');
      continue;
    }
    const id = /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1];
    if (!id || column < 0) continue;
    const states = [...(cells[column] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');
    if (states.length > 0) result[id] = states;
  }
  return result;
}

test('data-mm-state values per ID: the typed map and the catalog list the same states', () => {
  const typed = Object.fromEntries(
    Object.entries(ELEMENT_STATES).map(([id, states]) => [id, [...states].sort()]),
  );
  const documented = Object.fromEntries(
    Object.entries(catalogStates()).map(([id, states]) => [id, [...states].sort()]),
  );
  expect(Object.keys(typed).length).toBeGreaterThan(0);
  expect(documented).toEqual(typed);
  const ids = new Set(elementIdUnion());
  for (const id of Object.keys(typed)) expect(ids.has(id)).toBe(true);
});

test('every listed state is set somewhere in src/', () => {
  const code = sourceFiles()
    .filter((path) => path !== join('src', 'elementIds.ts'))
    .map(source)
    .join('\n');
  const unused = Object.entries(ELEMENT_STATES).flatMap(([id, states]) =>
    states.filter((state) => !code.includes(`'${state}'`)).map((state) => `${id}=${state}`),
  );
  expect(unused).toEqual([]);
});

test('data-mm-state is only written by src/elementIds.ts', () => {
  const others = sourceFiles().filter(
    (path) => path !== join('src', 'elementIds.ts') && source(path).includes('data-mm-state'),
  );
  expect(others).toEqual([]);
});

test('setElementState sets the state, or removes the attribute for null', () => {
  const el = document.createElement('button');
  setElementState(el, 'controls.drill', 'active');
  expect(el.getAttribute('data-mm-state')).toBe('active');
  setElementState(el, 'controls.drill', null);
  expect(el.hasAttribute('data-mm-state')).toBe(false);
});

test('styles.css highlights a collapsed node.toggle from its data-mm-state (issue #40)', () => {
  const css = readFileSync('styles.css', 'utf8');
  expect(css).toMatch(/button\.mind-mapper-collapse\[data-mm-state=['"]collapsed['"]\] \{/);
});

test('commands: one catalog entry per registered command (dev ones included)', async () => {
  const plugin = new MindMapperPlugin(fakeApp(new FakeWorkspace()), fakeManifest());
  await plugin.onload();
  const ids = (plugin as unknown as MockPlugin).commands.map((c) => `command.${c.id}`);
  expect(sorted(catalogIdsWith('command.'))).toEqual(sorted(ids));
});

test('settings: one catalog entry per settings row, by group', async () => {
  const plugin = new MindMapperPlugin(fakeApp(new FakeWorkspace()), fakeManifest());
  await plugin.onload();
  const tab = (plugin as unknown as MockPlugin).settingTabs[0];
  if (!tab) throw new Error('no setting tab');
  const ids = tab.getSettingDefinitions().flatMap((item) => {
    if (!('type' in item)) return [];
    const group = kebab(item.heading ?? '');
    return (item.items ?? []).map((row: MockSettingDefinition) => {
      const key = row.control?.key;
      return `settings.${group}.${kebab(key ?? row.name)}`;
    });
  });
  expect(sorted(catalogIdsWith('settings.'))).toEqual(sorted(ids));
});

test('notices: one catalog entry per notice message', () => {
  const keys = sourceFiles().flatMap((path) => [
    ...[...source(path).matchAll(/new Notice\(t\('(\w+)'/g)].map((m) => m[1] ?? ''),
  ]);
  // Ignored frontmatter values: the notice text comes from invalidOptionMessage.
  const frontmatter = source('src/view/frontmatter.ts');
  keys.push(...[...frontmatter.matchAll(/t\('(invalid\w+)'/g)].map((m) => m[1] ?? ''));
  expect(sorted(catalogIdsWith('notice.'))).toEqual(sorted(keys.map((k) => `notice.${kebab(k)}`)));
});

test('messages: one catalog entry per placeholder message', () => {
  const keys = [...source('src/view/MindMapView.ts').matchAll(/showMessage\(t\('(\w+)'/g)].map(
    (m) => m[1] ?? '',
  );
  expect(keys.length).toBeGreaterThan(0);
  expect(sorted(catalogIdsWith('message.'))).toEqual(
    sorted(keys.map((k) => `message.${kebab(k)}`)),
  );
});

test('frontmatter: one catalog entry per frontmatter key', () => {
  const keys = [...source('src/view/frontmatter.ts').matchAll(/'mind-mapper-([a-z-]+)'/g)].map(
    (m) => m[1] ?? '',
  );
  expect(sorted(catalogIdsWith('frontmatter.'))).toEqual(
    sorted(keys.map((k) => `frontmatter.${k}`)),
  );
});
