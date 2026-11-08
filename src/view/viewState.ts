export interface MindMapViewState {
  file: string | null;
}

export function parseViewState(state: unknown): MindMapViewState {
  if (typeof state === 'object' && state !== null && 'file' in state) {
    const { file } = state;
    if (typeof file === 'string' && file !== '') return { file };
  }
  return { file: null };
}

export function fileBasename(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}
