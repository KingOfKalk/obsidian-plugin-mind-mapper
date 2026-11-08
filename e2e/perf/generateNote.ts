/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = 'alpha beta gamma delta Größe Übung mind map node layout tree edge zoom pan'.split(
  ' ',
);

/**
 * Note with about `nodes` map nodes: H1, then H2 / H3 / H4 sections, each with a mix of
 * paragraphs (50 %), list items (30 %), code blocks (10 %) and tables (10 %).
 */
export function generateNote(nodes: number, seed: number): string {
  const random = rng(seed);
  const words = (count: number): string =>
    Array.from({ length: count }, () => WORDS[Math.floor(random() * WORDS.length)]).join(' ');
  const lines = [`# Generated ${nodes}`, ''];
  let count = 1;
  let section = 0;
  while (count < nodes) {
    section++;
    const level = 2 + (section % 3);
    lines.push(`${'#'.repeat(level)} Section ${section}`, '');
    count++;
    const blocks = 3 + Math.floor(random() * 5);
    for (let b = 0; b < blocks && count < nodes; b++) {
      const kind = random();
      if (kind < 0.5) {
        lines.push(words(5 + Math.floor(random() * 40)), '');
        count++;
      } else if (kind < 0.8) {
        const items = 2 + Math.floor(random() * 4);
        for (let i = 0; i < items && count < nodes; i++) {
          lines.push(`${i % 3 === 2 ? '  ' : ''}- ${words(3 + Math.floor(random() * 10))}`);
          count++;
        }
        lines.push('');
      } else if (kind < 0.9) {
        const codeLines = 2 + Math.floor(random() * 12);
        lines.push('```js', ...Array.from({ length: codeLines }, (_, i) => `const v${i} = ${i};`));
        lines.push('```', '');
        count++;
      } else {
        lines.push(
          '| a | b | c |',
          '| - | - | - |',
          `| ${words(1)} | ${words(2)} | ${words(1)} |`,
          '',
        );
        count++;
      }
    }
  }
  return lines.join('\n');
}
