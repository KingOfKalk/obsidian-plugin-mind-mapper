import { estimateSize, limitsFor, measuredSize, NODE_LIMITS } from '../../src/layout/nodeSize';
import type { MindMapNode } from '../../src/parser/types';

function node(
  markdown: string,
  kind: MindMapNode['kind'] = 'paragraph',
  sectionType: string | null = null,
): MindMapNode {
  return { id: 'n', kind, label: markdown, markdown, sectionType, level: 0, line: 0, children: [] };
}

test('limits match the spec', () => {
  expect(NODE_LIMITS).toMatchObject({ maxWidth: 320, maxHeight: 240, padX: 8, padY: 6, border: 1 });
  expect(NODE_LIMITS.thumb).toEqual({ width: 160, height: 120 });
});

test('short heading: one line, width from text', () => {
  expect(estimateSize(node('Tasks', 'heading'))).toEqual({ width: 5 * 8 + 18, height: 24 + 14 });
});

test('root: large text (1.5 times the char width and line height)', () => {
  expect(estimateSize(node('Project', 'root'))).toEqual({
    width: 7 * 8 * 1.5 + 18,
    height: 24 * 1.5 + 14,
  });
  // wraps earlier: 30 chars * 12 px = 360 px > 302 px content width
  expect(estimateSize(node('z'.repeat(30), 'root')).height).toBe(2 * 24 * 1.5 + 14);
});

test('long paragraph is capped at the max size', () => {
  expect(estimateSize(node('x'.repeat(2000)))).toEqual({ width: 320, height: 240 });
});

test('paragraph wraps at the max content width', () => {
  // content width 320 - 2 * (8 + 1) = 302 px; 75 chars * 8 px = 600 px = two lines
  expect(estimateSize(node('y'.repeat(75)))).toEqual({ width: 320, height: 2 * 24 + 14 });
});

test('code block: monospace width from the longest line, lines without wrapping', () => {
  const code = '```\n' + 'a'.repeat(20) + '\nb\n```';
  expect(estimateSize(node(code, 'block', 'code'))).toEqual({
    width: 20 * 7.8 + 18,
    height: 3 * 20 + 14,
  });
});

test('table: one row height per line', () => {
  expect(estimateSize(node('| a |\n| - |\n| 1 |\n| 2 |', 'block', 'table')).height).toBe(
    3 * 32 + 14,
  );
});

test.each(['![[pixel.png]]', '![alt](assets/pixel.png)', '![[photo.JPG|200]]'])(
  'image-only node %s uses the thumbnail box',
  (markdown) => {
    expect(estimateSize(node(markdown))).toEqual({ width: 178, height: 134 });
  },
);

test('empty markdown has a minimum width', () => {
  expect(estimateSize(node('')).width).toBe(40);
});

test('measuredSize: small content is not clipped', () => {
  expect(
    measuredSize({ offsetWidth: 100, offsetHeight: 40, scrollWidth: 100, scrollHeight: 40 }),
  ).toEqual({ size: { width: 118, height: 54 }, clipped: false, clip: { x: false, y: false } });
});

test('measuredSize: tall content is clamped and clipped', () => {
  expect(
    measuredSize({ offsetWidth: 300, offsetHeight: 228, scrollWidth: 300, scrollHeight: 900 }),
  ).toEqual({ size: { width: 318, height: 240 }, clipped: true, clip: { x: false, y: true } });
});

test('measuredSize: wide content is clamped and clipped', () => {
  expect(
    measuredSize({ offsetWidth: 302, offsetHeight: 50, scrollWidth: 900, scrollHeight: 50 }),
  ).toEqual({ size: { width: 320, height: 64 }, clipped: true, clip: { x: true, y: false } });
});

test('measuredSize: content exactly at the max is not clipped', () => {
  expect(
    measuredSize({ offsetWidth: 302, offsetHeight: 226, scrollWidth: 302, scrollHeight: 226 }),
  ).toEqual({ size: { width: 320, height: 240 }, clipped: false, clip: { x: false, y: false } });
});

test('measuredSize counts the border', () => {
  expect(
    measuredSize({ offsetWidth: 100, offsetHeight: 20, scrollWidth: 100, scrollHeight: 20 }).size,
  ).toEqual({ width: 118, height: 34 });
});

test('limitsFor 500 x 300 caps estimate and measure at 500 x 300', () => {
  const limits = limitsFor(500, 300);
  expect(limits).toMatchObject({ maxWidth: 500, maxHeight: 300, padX: 8, padY: 6, border: 1 });
  const huge = node('word '.repeat(2000));
  expect(estimateSize(huge, limits)).toEqual({ width: 500, height: 300 });
  expect(
    measuredSize(
      { offsetWidth: 482, offsetHeight: 286, scrollWidth: 900, scrollHeight: 900 },
      limits,
    ),
  ).toEqual({ size: { width: 500, height: 300 }, clipped: true, clip: { x: true, y: true } });
  // a long paragraph wraps at the wider content width
  expect(estimateSize(node('x'.repeat(100)), limits).height).toBe(
    estimateSize(node('x'.repeat(50))).height,
  );
});
