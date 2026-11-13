import type { MindMapNode } from '../parser/types';
import { DIVIDER_GAP, type LayoutDivider, type LayoutOptions, type PositionedNode } from './types';

/** Indent of a subtask per level below its card. */
export const KANBAN_INDENT = 20;

/** Card count bubble of a column header, mirroring `.mind-mapper-card-count` in styles.css. */
export const COUNT_BUBBLE = {
  /** Space between the header text and the bubble. */
  gap: 6,
  minWidth: 18,
  /** Horizontal padding and border. */
  chrome: 10,
  /** Generous width of one digit. */
  digit: 8,
};

export function countBubbleWidth(count: number): number {
  return Math.max(
    COUNT_BUBBLE.minWidth,
    COUNT_BUBBLE.chrome + COUNT_BUBBLE.digit * String(count).length,
  );
}

/**
 * Spec "Kanban" (issue #32): the root as a headline centered above the board; its children are
 * columns side by side, all as wide as the widest header (plus its count bubble), card or subtask
 * (plus its indent), at most the max node width (but never narrower than a node); their children are cards stacked downwards, all
 * deeper nodes subtasks indented below their card (pre-order). Column gap: twice the sibling gap;
 * root to headers: the level gap; everything stacked: the sibling gap. A divider (`---`) adds
 * DIVIDER_GAP: a vertical line between two columns, a horizontal one between two cards or
 * subtasks. Overlap-free: columns are disjoint, each column a single stack.
 */
export function kanban(
  root: MindMapNode,
  options: LayoutOptions,
): { nodes: PositionedNode[]; dividers: LayoutDivider[] } {
  const { siblingGap, levelGap, nodeSize } = options;
  const columns = root.children;
  const countOf = (node: MindMapNode): number => options.childCount?.(node) ?? node.children.length;
  const indentOf = (depth: number): number => Math.max(0, depth - 2) * KANBAN_INDENT;

  const sizes = new Map<MindMapNode, { width: number; height: number }>();
  const size = (node: MindMapNode) => {
    let s = sizes.get(node);
    if (!s) {
      s = nodeSize(node);
      sizes.set(node, s);
    }
    return s;
  };

  // Column width: the widest header (+ bubble), card or subtask (+ indent), capped; never
  // narrower than a node itself (an image thumbnail can be wider than the cap).
  let widest = 0;
  let widestNode = 0;
  const measure = (node: MindMapNode, depth: number): void => {
    const extra =
      depth === 1 ? COUNT_BUBBLE.gap + countBubbleWidth(countOf(node)) : indentOf(depth);
    widest = Math.max(widest, size(node).width + extra);
    widestNode = Math.max(widestNode, size(node).width);
    for (const child of node.children) measure(child, depth + 1);
  };
  for (const column of columns) measure(column, 1);
  const width = Math.max(widestNode, Math.min(options.maxNodeWidth ?? Infinity, widest));

  const rootSize = size(root);
  const nodes: PositionedNode[] = [
    {
      node: root,
      x: -rootSize.width / 2,
      y: 0,
      ...rootSize,
      childSide: 'bottom',
      align: 'center',
      depth: 0,
      branch: -1,
    },
  ];
  const dividers: LayoutDivider[] = [];
  if (columns.length === 0) return { nodes, dividers };

  const columnGap = 2 * siblingGap;
  const hasDivider = (i: number): boolean => i > 0 && columns[i]?.dividerBefore === true;
  const boardWidth = columns.reduce(
    (sum, _column, i) =>
      sum + width + (i === 0 ? 0 : columnGap + (hasDivider(i) ? DIVIDER_GAP : 0)),
    0,
  );
  const headerTop = rootSize.height + levelGap;
  const cardTop =
    headerTop + Math.max(...columns.map((column) => size(column).height)) + siblingGap;

  let left = -boardWidth / 2;
  let previousBottom = 0;
  columns.forEach((column, branch) => {
    // A divider before this column; it runs down to the end of the longer of the two columns.
    let line: LayoutDivider | null = null;
    if (branch > 0) {
      const gap = columnGap + (hasDivider(branch) ? DIVIDER_GAP : 0);
      if (hasDivider(branch)) {
        const x = left + gap / 2;
        line = { parentId: root.id, from: { x, y: headerTop }, to: { x, y: previousBottom } };
        dividers.push(line);
      }
      left += gap;
    }
    const header = size(column);
    nodes.push({
      node: column,
      x: left,
      y: headerTop,
      width,
      height: header.height,
      childSide: 'bottom',
      align: 'left',
      depth: 1,
      branch,
      count: countOf(column),
    });
    let bottom = headerTop + header.height;
    let top = cardTop;

    /** Places the children of `parent` (cards or subtasks) and their subtasks, top to bottom. */
    const stack = (parent: MindMapNode, depth: number): void => {
      parent.children.forEach((child, i) => {
        const divider = i > 0 && child.dividerBefore === true;
        const own = size(child);
        const indent = Math.min(indentOf(depth), Math.max(0, width - own.width));
        const x = left + indent;
        if (divider) {
          const y = bottom + (siblingGap + DIVIDER_GAP) / 2;
          dividers.push({ parentId: parent.id, from: { x, y }, to: { x: left + width, y } });
          top = bottom + siblingGap + DIVIDER_GAP;
        }
        nodes.push({
          node: child,
          x,
          y: top,
          width: width - indent,
          height: own.height,
          childSide: 'bottom',
          align: 'left',
          depth,
          branch,
        });
        bottom = top + own.height;
        top = bottom + siblingGap;
        stack(child, depth + 1);
      });
    };
    stack(column, 2);

    if (line) line.to.y = Math.max(previousBottom, bottom);
    previousBottom = bottom;
    left += width;
  });
  return { nodes, dividers };
}
