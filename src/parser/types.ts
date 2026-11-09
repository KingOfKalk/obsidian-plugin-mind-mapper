/** Plain parser input, independent of Obsidian types. Offsets index into `text`. */
export interface HeadingInput {
  text: string;
  level: number;
  line: number;
}

export interface SectionInput {
  type: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface ListItemInput {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  /** Line of the parent item; negative for top-level items (minus the list's first line). */
  parentLine: number;
  /** Task status character (`' '`, `'x'`, `'-'`, …) or `null` for a plain item. */
  task: string | null;
}

export interface EmbedInput {
  /** Offset of the leading `!`. */
  startOffset: number;
  endOffset: number;
  link: string;
}

export interface ParserInput {
  headings: HeadingInput[];
  /** First line of any content section (not frontmatter, comment or blank); headings count. */
  firstContentLine: number | null;
  /** Note text; required for section nodes (heading-only input may omit it). */
  text?: string;
  sections?: SectionInput[];
  listItems?: ListItemInput[];
  embeds?: EmbedInput[];
}

export type NodeKind = 'root' | 'heading' | 'paragraph' | 'list-item' | 'block';

export interface MindMapNode {
  /** Stable identity: escaped heading path plus `#n` ordinals; `''` for the virtual root. */
  id: string;
  kind: NodeKind;
  /** Plain fallback text (tooltip, render failure). */
  label: string;
  /** Markdown rendered into the node. */
  markdown: string;
  /** Section type of `block` nodes (`code`, `table`, `math`, `blockquote`, `callout`, …). */
  sectionType: string | null;
  /** Heading level; `0` for the virtual root and non-heading nodes. */
  level: number;
  /** Source line; `null` for the virtual root. */
  line: number | null;
  /** Last source line of the node's own content (cross-link mapping); absent for the virtual root. */
  endLine?: number;
  /** A divider (thematic break) sits between this node and its previous sibling (spec "Dividers"). */
  dividerBefore?: boolean;
  children: MindMapNode[];
}

export interface MindMapTree {
  root: MindMapNode;
}
