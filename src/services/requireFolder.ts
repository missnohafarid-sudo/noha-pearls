import type { Id } from '../domain/models';
import type { DocumentStore } from '../ports/store';

export class FolderError extends Error {
  constructor(readonly code: 'folder-inside-itself' | 'folder-missing') {
    super(code);
    this.name = 'FolderError';
  }
}

/** A folder id must name a stored folder, or be null for the top level; a missing one is refused the same way everywhere. */
export async function requireFolder(store: DocumentStore, folderId: Id | null): Promise<void> {
  if (folderId !== null && !(await store.get('folders', folderId))) throw new FolderError('folder-missing');
}
