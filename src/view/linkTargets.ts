import { type CachedMetadata, parseLinktext, resolveSubpath } from 'obsidian';
import type { CrossLinkInput } from '../layout/crossLinks';

/**
 * Spec "Links": heading links (`[[#H]]`, `[[#A#B]]`, `[[Note#H]]` when Note is this note) and block
 * links (`[[#^id]]`) become cross-links, resolved like Obsidian resolves them. `resolvePath` is
 * `metadataCache.getFirstLinkpathDest(...)?.path`.
 */
export function crossLinkInputs(
  cache: CachedMetadata,
  sourcePath: string,
  resolvePath: (linkpath: string, sourcePath: string) => string | null,
): CrossLinkInput[] {
  const inputs: CrossLinkInput[] = [];
  for (const link of cache.links ?? []) {
    const { path, subpath } = parseLinktext(link.link);
    if (!subpath) continue;
    if (path !== '' && resolvePath(path, sourcePath) !== sourcePath) continue;
    const target = resolveSubpath(cache, subpath);
    const toLine =
      target?.type === 'heading'
        ? target.current.position.start.line
        : target?.type === 'block'
          ? target.block.position.start.line
          : null;
    if (toLine === null) continue;
    inputs.push({ fromLine: link.position.start.line, toLine });
  }
  return inputs;
}
