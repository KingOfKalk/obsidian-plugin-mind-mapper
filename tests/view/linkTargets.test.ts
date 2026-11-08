import { crossLinkInputs } from '../../src/view/linkTargets';
import { loadFixture } from '../fixtures';

test('crossLinkInputs of the crosslinks fixture', () => {
  const { cache } = loadFixture('crosslinks');
  if (!cache) throw new Error('no cache');
  const resolvePath = (linkpath: string) =>
    linkpath === 'crosslinks' ? 'fixtures/crosslinks.md' : `fixtures/${linkpath}.md`;
  expect(crossLinkInputs(cache, 'fixtures/crosslinks.md', resolvePath)).toEqual([
    { fromLine: 4, toLine: 6 },
    { fromLine: 4, toLine: 10 },
    { fromLine: 14, toLine: 8 },
    { fromLine: 14, toLine: 2 },
    { fromLine: 16, toLine: 12 },
    { fromLine: 17, toLine: 2 },
  ]);
});

test('a link path that resolves to another note is not a cross-link', () => {
  const { cache } = loadFixture('crosslinks');
  if (!cache) throw new Error('no cache');
  const inputs = crossLinkInputs(cache, 'fixtures/crosslinks.md', () => 'Other.md');
  // only links without a path ([[#…]]) remain
  expect(inputs).toHaveLength(5);
});
