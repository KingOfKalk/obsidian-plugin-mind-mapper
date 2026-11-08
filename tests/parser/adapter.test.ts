import { toParserInput } from '../../src/parser/adapter';
import { loadFixture } from '../fixtures';

function input(name: string) {
  const { cache, text } = loadFixture(name);
  return toParserInput(cache, text);
}

test('null cache gives empty input', () => {
  expect(toParserInput(null, '# A')).toMatchObject({
    headings: [],
    firstContentLine: null,
    sections: [],
    listItems: [],
    embeds: [],
  });
});

test('headings come from the cache with text, level and line', () => {
  expect(input('worked-example').headings).toEqual([
    { text: 'Project', level: 1, line: 0 },
    { text: 'Tasks', level: 2, line: 3 },
    { text: 'Notes', level: 2, line: 8 },
  ]);
});

test('frontmatter and %% comments are not content', () => {
  expect(input('ignored-before-h1').firstContentLine).toBe(6);
});

test('a paragraph before the H1 is content', () => {
  expect(input('content-before-h1').firstContentLine).toBe(3);
});

test.each(['frontmatter-only', 'empty'])('%s has no content', (name) => {
  expect(input(name)).toMatchObject({ headings: [], firstContentLine: null });
});

test('a paragraph that only contains %% inside is content', () => {
  const text = 'a %% b\n\n# T\n';
  const cache = {
    sections: [
      { type: 'paragraph', position: pos(0, 0, 6) },
      { type: 'heading', position: pos(2, 8, 11) },
    ],
    headings: [{ heading: 'T', level: 1, position: pos(2, 8, 11) }],
  };
  expect(toParserInput(cache, text).firstContentLine).toBe(0);
});

function pos(line: number, start: number, end: number) {
  return {
    start: { line, col: 0, offset: start },
    end: { line, col: end - start, offset: end },
  };
}
