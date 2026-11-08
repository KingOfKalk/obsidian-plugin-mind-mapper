import { estimateSize, measuredSize, NODE_LIMITS } from '../../src/layout/nodeSize';
import type { MindMapNode } from '../../src/parser/types';

function node(
  markdown: string,
  kind: MindMapNode['kind'] = 'paragraph',
  sectionType: string | null = null,
): MindMapNode {
  return { id: 'n', kind, label: markdown, markdown, sectionType, level: 0, line: 0, children: [] };
}

test('limits match the spec', () => {
  expect(NODE_LIMITS).toMatchObject({ maxWidth: 320, maxHeight: 240, padX: 8, padY: 6 });
  expect(NODE_LIMITS.thumb).toEqual({ width: 160, height: 120 });
});

test('short heading: one line, width from text', () => {
  expect(estimateSize(node('Tasks', 'heading'))).toEqual({ width: 5 * 8 + 16, height: 24 + 12 });
});

test('long paragraph is capped at the max size', () => {
  expect(estimateSize(node('x'.repeat(2000)))).toEqual({ width: 320, height: 240 });
});

test('paragraph wraps at the max content width', () => {
  // 76 chars * 8 px = 608 px = two lines of 304 px
  expect(estimateSize(node('y'.repeat(76)))).toEqual({ width: 320, height: 2 * 24 + 12 });
});

test('code block: monospace width from the longest line, lines without wrapping', () => {
  const code = '```\n' + 'a'.repeat(20) + '\nb\n```';
  expect(estimateSize(node(code, 'block', 'code'))).toEqual({
    width: 20 * 7.8 + 16,
    height: 3 * 20 + 12,
  });
});

test('table: one row height per line', () => {
  expect(estimateSize(node('| a |\n| - |\n| 1 |\n| 2 |', 'block', 'table')).height).toBe(
    3 * 32 + 12,
  );
});

test.each(['![[pixel.png]]', '![alt](assets/pixel.png)', '![[photo.JPG|200]]'])(
  'image-only node %s uses the thumbnail box',
  (markdown) => {
    expect(estimateSize(node(markdown))).toEqual({ width: 176, height: 132 });
  },
);

test('empty markdown has a minimum width', () => {
  expect(estimateSize(node('')).width).toBe(40);
});

test('measuredSize: small content is not clipped', () => {
  expect(
    measuredSize({ offsetWidth: 100, offsetHeight: 40, scrollWidth: 100, scrollHeight: 40 }),
  ).toEqual({ size: { width: 116, height: 52 }, clipped: false, clip: { x: false, y: false } });
});

test('measuredSize: tall content is clamped and clipped', () => {
  expect(
    measuredSize({ offsetWidth: 300, offsetHeight: 228, scrollWidth: 300, scrollHeight: 900 }),
  ).toEqual({ size: { width: 316, height: 240 }, clipped: true, clip: { x: false, y: true } });
});

test('measuredSize: wide content is clamped and clipped', () => {
  expect(
    measuredSize({ offsetWidth: 304, offsetHeight: 50, scrollWidth: 900, scrollHeight: 50 }),
  ).toEqual({ size: { width: 320, height: 62 }, clipped: true, clip: { x: true, y: false } });
});

test('measuredSize: content exactly at the max is not clipped', () => {
  expect(
    measuredSize({ offsetWidth: 304, offsetHeight: 228, scrollWidth: 304, scrollHeight: 228 }),
  ).toEqual({ size: { width: 320, height: 240 }, clipped: false, clip: { x: false, y: false } });
});
