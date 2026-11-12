import type { Id } from '../../domain/models';
import { LessonCard } from './LessonCard';
import { LibraryBrowser } from './LibraryBrowser';
import type { LibraryView } from './useLibraryView';

/** The lessons as anyone sees them: folders to open and lessons to read, nothing to change. */
export function PublicLibrary({ view, openId, onOpen }: { view: LibraryView; openId: Id | null; onOpen: (folderId: Id | null) => void }) {
  return <LibraryBrowser view={view} openId={openId} onOpen={onOpen} renderLesson={(lesson) => <LessonCard lesson={lesson} admin={false} />} />;
}
