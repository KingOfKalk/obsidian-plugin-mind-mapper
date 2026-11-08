/** Plain parser input, independent of Obsidian types. */
export interface HeadingInput {
  text: string;
  level: number;
  line: number;
}

export interface ParserInput {
  headings: HeadingInput[];
  /** First line of any content section (not frontmatter, comment or blank); headings count. */
  firstContentLine: number | null;
}

export type NodeKind = 'root' | 'heading';

export interface MindMapNode {
  /** Stable identity: escaped heading path; `''` for the virtual root. */
  id: string;
  kind: NodeKind;
  label: string;
  /** Heading level; `0` for the virtual root. */
  level: number;
  /** Source line; `null` for the virtual root. */
  line: number | null;
  children: MindMapNode[];
}

export interface MindMapTree {
  root: MindMapNode;
}
