import { buildTree } from '../../src/parser/buildTree';
import type { HeadingInput, MindMapNode, ParserInput, SectionInput } from '../../src/parser/types';

function h(text: string, level: number, line: number): HeadingInput {
  return { text, level, line };
}

/** Builds headings from `#`-prefixed strings, one per line. */
function headings(...lines: string[]): HeadingInput[] {
  return lines.map((l, line) => {
    const match = /^(#+) (.*)$/.exec(l);
    if (!match?.[1] || match[2] === undefined) throw new Error(`bad heading ${l}`);
    return h(match[2], match[1].length, line);
  });
}

function outline(node: MindMapNode, depth = 0): string[] {
  return [
    `${'  '.repeat(depth)}${node.id}`,
    ...node.children.flatMap((c) => outline(c, depth + 1)),
  ];
}

test('single H1 without content before it is the root', () => {
  const tree = buildTree(
    { headings: [h('Project', 1, 0), h('Tasks', 2, 3), h('Notes', 2, 8)], firstContentLine: 0 },
    'note',
  );
  expect(tree.root).toMatchObject({
    id: 'Project',
    kind: 'root',
    label: 'Project',
    level: 1,
    line: 0,
  });
  expect(tree.root.children.map((c) => c.id)).toEqual(['Project/Tasks', 'Project/Notes']);
  expect(tree.root.children.map((c) => c.line)).toEqual([3, 8]);
  expect(tree.root.children[0]).toMatchObject({ kind: 'heading', label: 'Tasks', level: 2 });
});

test('content before the H1 gives a virtual root', () => {
  const tree = buildTree({ headings: [h('Title', 1, 4)], firstContentLine: 2 }, 'note');
  expect(tree.root).toMatchObject({ id: '', kind: 'root', label: 'note', level: 0, line: null });
  expect(outline(tree.root)).toEqual(['', '  Title']);
});

test('multiple H1s give a virtual root with H1s as first level', () => {
  const tree = buildTree(
    { headings: headings('# One', '## One child', '# Two'), firstContentLine: 0 },
    'note',
  );
  expect(outline(tree.root)).toEqual(['', '  One', '    One/One child', '  Two']);
});

test('no H1: highest level present is first level', () => {
  const tree = buildTree(
    {
      headings: headings('### Deep first', '## A', '### A1', '## B', '##### B deep'),
      firstContentLine: 0,
    },
    'note',
  );
  expect(outline(tree.root)).toEqual([
    '',
    '  Deep first',
    '  A',
    '    A/A1',
    '  B',
    '    B/B deep',
  ]);
});

test('skipped levels attach to nearest parent', () => {
  const tree = buildTree(
    { headings: headings('# A', '### B', '## C', '#### D', '## E'), firstContentLine: 0 },
    'note',
  );
  expect(outline(tree.root)).toEqual(['A', '  A/B', '  A/C', '    A/C/D', '  A/E']);
});

test('duplicate siblings get occurrence index, cousins do not', () => {
  const tree = buildTree(
    {
      headings: headings('# R', '## X', '### N', '## Y', '### N', '## X'),
      firstContentLine: 0,
    },
    'note',
  );
  expect(outline(tree.root)).toEqual(['R', '  R/X', '    R/X/N', '  R/Y', '    R/Y/N', '  R/X[2]']);
});

test.each([0, null])('no headings gives a root-only tree (firstContentLine %s)', (first) => {
  const tree = buildTree({ headings: [], firstContentLine: first }, 'My note');
  expect(tree.root).toEqual({
    id: '',
    kind: 'root',
    label: 'My note',
    markdown: 'My note',
    sectionType: null,
    level: 0,
    line: null,
    children: [],
  });
});

/** Builds parser input from note lines and section specs [type, startLine, endLine]. */
function noteInput(lines: string[], specs: [string, number, number][]): ParserInput {
  const text = lines.join('\n');
  const lineStart = (line: number) => lines.slice(0, line).join('\n').length + (line > 0 ? 1 : 0);
  const sections: SectionInput[] = specs.map(([type, startLine, endLine]) => ({
    type,
    startLine,
    endLine,
    startOffset: lineStart(startLine),
    endOffset: lineStart(endLine) + (lines[endLine]?.length ?? 0),
  }));
  const headings = specs
    .filter(([type]) => type === 'heading')
    .map(([, line]) => {
      const match = /^(#+) (.*)$/.exec(lines[line] ?? '');
      return h(match?.[2] ?? '', match?.[1]?.length ?? 1, line);
    });
  const firstContent = sections.find((s) => s.type !== 'yaml');
  return {
    text,
    headings,
    sections,
    listItems: [],
    embeds: [],
    firstContentLine: firstContent?.startLine ?? null,
  };
}

function nodes(node: MindMapNode, depth = 0): string[] {
  const own = `${'  '.repeat(depth)}${node.id} [${node.kind}${node.sectionType ? `:${node.sectionType}` : ''}] ${node.markdown}`;
  return [own, ...node.children.flatMap((c) => nodes(c, depth + 1))];
}

test('paragraphs attach to their heading, ordinals skip headings', () => {
  const input = noteInput(
    ['# P', 'First.', '## H', 'Under H.', '# Q', 'Second root para.'],
    [
      ['heading', 0, 0],
      ['paragraph', 1, 1],
      ['heading', 2, 2],
      ['paragraph', 3, 3],
    ],
  );
  expect(nodes(buildTree(input, 'note').root)).toEqual([
    'P [root] P',
    '  P/#1 [paragraph] First.',
    '  P/H [heading] H',
    '    P/H/#1 [paragraph] Under H.',
  ]);
});

test('ordinals count only non-heading siblings', () => {
  const input = noteInput(
    ['# P', 'One.', '## H', 'x', '## Back', 'Two.'],
    [
      ['heading', 0, 0],
      ['paragraph', 1, 1],
      ['heading', 2, 2],
      ['heading', 4, 4],
      ['paragraph', 5, 5],
    ],
  );
  const ids = buildTree(input, 'note').root.children.map((c) => c.id);
  expect(ids).toEqual(['P/#1', 'P/H', 'P/Back']);
  expect(buildTree(input, 'note').root.children[2]?.children[0]?.id).toBe('P/Back/#1');
});

test('skipped section types and blank sections produce no node', () => {
  const input = noteInput(
    ['# P', '---', '<div>x</div>', '[^1]: def', '%% comment %%', '   ', 'Kept.'],
    [
      ['heading', 0, 0],
      ['thematicBreak', 1, 1],
      ['html', 2, 2],
      ['footnoteDefinition', 3, 3],
      ['paragraph', 4, 4],
      ['text', 5, 5],
      ['paragraph', 6, 6],
    ],
  );
  expect(nodes(buildTree(input, 'note').root)).toEqual(['P [root] P', '  P/#1 [paragraph] Kept.']);
});

test('other section types become block nodes with their type', () => {
  const input = noteInput(
    ['# P', '```', 'code', '```', '> quote', '| a |', '| - |'],
    [
      ['heading', 0, 0],
      ['code', 1, 3],
      ['blockquote', 4, 4],
      ['table', 5, 6],
    ],
  );
  expect(nodes(buildTree(input, 'note').root)).toEqual([
    'P [root] P',
    '  P/#1 [block:code] ```\ncode\n```',
    '  P/#2 [block:blockquote] > quote',
    '  P/#3 [block:table] | a |\n| - |',
  ]);
});

test('content before the first heading attaches to the virtual root', () => {
  const input = noteInput(
    ['Intro.', '# T'],
    [
      ['paragraph', 0, 0],
      ['heading', 1, 1],
    ],
  );
  expect(nodes(buildTree(input, 'note').root)).toEqual([
    ' [root] note',
    '  #1 [paragraph] Intro.',
    '  T [heading] T',
  ]);
});

test('buildTree title replaces the root label but keeps the root id (H1 root)', () => {
  const tree = buildTree(
    { headings: headings('# Project', '## Tasks'), firstContentLine: null },
    'Note',
    'My *map*',
  );
  expect(tree.root.id).toBe('Project');
  expect(tree.root.markdown).toBe('My *map*');
  expect(tree.root.label).toBe('My *map*');
  expect(tree.root.line).toBe(0);
  expect(tree.root.children[0]?.id).toBe('Project/Tasks');
});

test('buildTree title replaces the root label but keeps the root id (virtual root)', () => {
  const tree = buildTree({ headings: headings('## A'), firstContentLine: null }, 'Note', '1. Plan');
  expect(tree.root.id).toBe('');
  expect(tree.root.markdown).toBe('1\\. Plan');
  expect(buildTree({ headings: [], firstContentLine: null }, 'Note', null).root.markdown).toBe(
    'Note',
  );
});
