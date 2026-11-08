import { escapeBlockStart, sliceMarkdown } from '../../src/parser/nodeMarkdown';
import type { EmbedInput } from '../../src/parser/types';

/** Builds a text with embeds at their real offsets. */
function withEmbeds(text: string, ...links: [original: string, link: string][]) {
  const embeds: EmbedInput[] = links.map(([original, link]) => {
    const startOffset = text.indexOf(original);
    return { startOffset, endOffset: startOffset + original.length, link };
  });
  return { text, embeds };
}

test.each<[string, string, string]>([
  ['![[Note]]', 'Note', '[[Note]]'],
  ['![[Note#H]]', 'Note#H', '[[Note#H]]'],
  ['![[doc.pdf]]', 'doc.pdf', '[[doc.pdf]]'],
  ['![[clip.mp4|200]]', 'clip.mp4', '[[clip.mp4|200]]'],
  ['![[pixel.png]]', 'pixel.png', '![[pixel.png]]'],
  ['![[Pixel.PNG|100]]', 'Pixel.PNG', '![[Pixel.PNG|100]]'],
  ['![a](x.png)', 'x.png', '![a](x.png)'],
])('embed %s -> %s', (original, link, expected) => {
  const { text, embeds } = withEmbeds(`See ${original} here`, [original, link]);
  expect(sliceMarkdown(text, 0, text.length, embeds)).toBe(`See ${expected} here`);
});

test('only embeds inside the range are rewritten, with offsets relative to the slice', () => {
  const { text, embeds } = withEmbeds('![[A]]\n\n![[B]]', ['![[A]]', 'A'], ['![[B]]', 'B']);
  expect(sliceMarkdown(text, 8, text.length, embeds)).toBe('[[B]]');
});

test('trailing block id is stripped', () => {
  expect(sliceMarkdown('Text ^para-id', 0, 13, [])).toBe('Text');
  expect(sliceMarkdown('Line\nmore ^b-1  ', 0, 16, [])).toBe('Line\nmore');
});

test('a caret inside the text is kept', () => {
  expect(sliceMarkdown('a ^b c', 0, 6, [])).toBe('a ^b c');
});

test.each<[string, string]>([
  ['1. Introduction', '1\\. Introduction'],
  ['12) x', '12\\) x'],
  ['- a', '\\- a'],
  ['+ a', '\\+ a'],
  ['* a', '\\* a'],
  ['> a', '\\> a'],
  ['## a', '\\## a'],
  ['1.5 litres', '1.5 litres'],
  ['#tag', '#tag'],
  ['plain', 'plain'],
])('escapeBlockStart(%s) -> %s', (text, expected) => {
  expect(escapeBlockStart(text)).toBe(expected);
});
