import { isImageLink } from '../parser/nodeMarkdown';
import type { MindMapNode } from '../parser/types';
import type { Size } from './types';

export interface NodeLimits {
  maxWidth: number;
  maxHeight: number;
  padX: number;
  padY: number;
  /** Node border width (each side). */
  border: number;
  minWidth: number;
  thumb: Size;
}

/** Spec "Node size": max 320 x 240 px by default (plugin settings); image embeds in a fixed thumbnail box. */
export const NODE_LIMITS: NodeLimits = {
  maxWidth: 320,
  maxHeight: 240,
  padX: 8,
  padY: 6,
  border: 1,
  minWidth: 40,
  thumb: { width: 160, height: 120 },
};

export function limitsFor(maxWidth: number, maxHeight: number): NodeLimits {
  return { ...NODE_LIMITS, maxWidth, maxHeight };
}

/** Horizontal and vertical space around the content (padding and border). */
function chrome(limits: NodeLimits): Size {
  return {
    width: 2 * (limits.padX + limits.border),
    height: 2 * (limits.padY + limits.border),
  };
}

const TEXT = { charWidth: 8, lineHeight: 24 };
const CODE = { charWidth: 7.8, lineHeight: 20 };
const TABLE_ROW_HEIGHT = 32;
const FENCE = /^\s*(```|~~~)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const IMAGE_ONLY = /^!\[\[([^\]]+)\]\]$|^!\[[^\]]*\]\(([^)]+)\)$/;

/** Instant size guess from the markdown, so the first layout needs no measuring. */
export function estimateSize(node: MindMapNode, limits: NodeLimits = NODE_LIMITS): Size {
  const extra = chrome(limits);
  const markdown = node.markdown.trim();
  const image = IMAGE_ONLY.exec(markdown);
  const imageLink = image?.[1] ?? image?.[2];
  if (imageLink && isImageLink(imageLink)) {
    return { width: limits.thumb.width + extra.width, height: limits.thumb.height + extra.height };
  }

  const lines = markdown.split('\n');
  if (node.sectionType === 'code') {
    const codeLines = lines.filter((line) => !FENCE.test(line));
    // + 1 line for the code block's own padding
    return box(
      longest(codeLines) * CODE.charWidth,
      (codeLines.length + 1) * CODE.lineHeight,
      limits,
    );
  }
  if (node.sectionType === 'table') {
    const rows = lines.filter((line) => !TABLE_SEPARATOR.test(line));
    return box(longest(rows) * TEXT.charWidth, rows.length * TABLE_ROW_HEIGHT, limits);
  }

  const contentWidth = limits.maxWidth - extra.width;
  const wrapped = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil((line.length * TEXT.charWidth) / contentWidth)),
    0,
  );
  return box(longest(lines) * TEXT.charWidth, wrapped * TEXT.lineHeight, limits);
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
export function measuredSize(
  content: ContentBox,
  limits: NodeLimits = NODE_LIMITS,
): { size: Size; clipped: boolean; clip: Clip } {
  const extra = chrome(limits);
  const width = Math.max(content.offsetWidth, content.scrollWidth) + extra.width;
  const height = Math.max(content.offsetHeight, content.scrollHeight) + extra.height;
  return {
    size: { width: Math.min(limits.maxWidth, width), height: Math.min(limits.maxHeight, height) },
    clipped: width > limits.maxWidth || height > limits.maxHeight,
    clip: { x: width > limits.maxWidth, y: height > limits.maxHeight },
  };
}

function box(contentWidth: number, contentHeight: number, limits: NodeLimits): Size {
  const extra = chrome(limits);
  return {
    width: Math.min(limits.maxWidth, Math.max(limits.minWidth, contentWidth + extra.width)),
    height: Math.min(limits.maxHeight, contentHeight + extra.height),
  };
}

function longest(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, line.length), 0);
}
