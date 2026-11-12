import type { Id } from '../../domain/models';
import { PickableLessonCard } from './LessonCard';
import { LibraryBrowser } from './LibraryBrowser';
import type { LibraryView } from './useLibraryView';

interface LessonPickerProps {
  view: LibraryView;
  openId: Id | null;
  onOpen: (folderId: Id | null) => void;
  chosenId: Id | undefined;
  onPick: (lessonId: Id) => void;
}

/** The lessons to start a class with: folders to open and a button on each lesson. */
export function LessonPicker({ view, openId, onOpen, chosenId, onPick }: LessonPickerProps) {
  return <LibraryBrowser view={view} openId={openId} onOpen={onOpen} renderLesson={(lesson) => <PickableLessonCard lesson={lesson} chosen={chosenId === lesson.id} onPick={() => onPick(lesson.id)} />} />;
}
