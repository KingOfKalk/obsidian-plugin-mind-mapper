import { isImageLink } from '../parser/nodeMarkdown';
import type { MindMapNode } from '../parser/types';
import type { Size } from './types';

/** Spec "Node size": max 320 x 240 px (settings in M4); image embeds in a fixed thumbnail box. */
export const NODE_LIMITS = {
  maxWidth: 320,
  maxHeight: 240,
  padX: 8,
  padY: 6,
  minWidth: 40,
  thumb: { width: 160, height: 120 },
};

const TEXT = { charWidth: 8, lineHeight: 24 };
const CODE = { charWidth: 7.8, lineHeight: 20 };
const TABLE_ROW_HEIGHT = 32;
const FENCE = /^\s*(```|~~~)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const IMAGE_ONLY = /^!\[\[([^\]]+)\]\]$|^!\[[^\]]*\]\(([^)]+)\)$/;

/** Instant size guess from the markdown, so the first layout needs no measuring. */
export function estimateSize(node: MindMapNode): Size {
  const markdown = node.markdown.trim();
  const image = IMAGE_ONLY.exec(markdown);
  const imageLink = image?.[1] ?? image?.[2];
  if (imageLink && isImageLink(imageLink)) {
    return {
      width: NODE_LIMITS.thumb.width + 2 * NODE_LIMITS.padX,
      height: NODE_LIMITS.thumb.height + 2 * NODE_LIMITS.padY,
    };
  }

  const lines = markdown.split('\n');
  if (node.sectionType === 'code') {
    const codeLines = lines.filter((line) => !FENCE.test(line));
    // + 1 line for the code block's own padding
    return box(longest(codeLines) * CODE.charWidth, (codeLines.length + 1) * CODE.lineHeight);
  }
  if (node.sectionType === 'table') {
    const rows = lines.filter((line) => !TABLE_SEPARATOR.test(line));
    return box(longest(rows) * TEXT.charWidth, rows.length * TABLE_ROW_HEIGHT);
  }

  const contentWidth = NODE_LIMITS.maxWidth - 2 * NODE_LIMITS.padX;
  const wrapped = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil((line.length * TEXT.charWidth) / contentWidth)),
    0,
  );
  return box(longest(lines) * TEXT.charWidth, wrapped * TEXT.lineHeight);
}

export interface ContentBox {
  offsetWidth: number;
  offsetHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface Clip {
  x: boolean;
  y: boolean;
}

/** Node size from its rendered content element, clamped to the max; `clip` per overflowing axis. */
export function measuredSize(content: ContentBox): { size: Size; clipped: boolean; clip: Clip } {
  const width = Math.max(content.offsetWidth, content.scrollWidth) + 2 * NODE_LIMITS.padX;
  const height = Math.max(content.offsetHeight, content.scrollHeight) + 2 * NODE_LIMITS.padY;
  return {
    size: {
      width: Math.min(NODE_LIMITS.maxWidth, width),
      height: Math.min(NODE_LIMITS.maxHeight, height),
    },
    clipped: width > NODE_LIMITS.maxWidth || height > NODE_LIMITS.maxHeight,
    clip: { x: width > NODE_LIMITS.maxWidth, y: height > NODE_LIMITS.maxHeight },
  };
}

function box(contentWidth: number, contentHeight: number): Size {
  return {
    width: Math.min(
      NODE_LIMITS.maxWidth,
      Math.max(NODE_LIMITS.minWidth, contentWidth + 2 * NODE_LIMITS.padX),
    ),
    height: Math.min(NODE_LIMITS.maxHeight, contentHeight + 2 * NODE_LIMITS.padY),
  };
}

function longest(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}
