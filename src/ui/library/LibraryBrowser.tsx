import { Fragment, type ReactNode } from 'react';
import type { Id, Lesson, LessonFolder } from '../../domain/models';
import { t } from '../../i18n';
import { focusKey, useFocusTarget } from './focus';
import { FolderTile } from './FolderTile';
import { PathLine } from './PathLine';
import type { LibraryView } from './useLibraryView';
import './library.css';

interface LibraryBrowserProps {
  view: LibraryView;
  /** The folder shown; null is the top level. */
  openId: Id | null;
  onOpen: (folderId: Id | null) => void;
  /** One lesson of the open folder. */
  renderLesson: (lesson: Lesson) => ReactNode;
  /** One folder of the open folder, and the one after it; plain tiles when absent. */
  renderFolder?: (folder: LessonFolder, next: LessonFolder | undefined) => ReactNode;
  /** After the folder tiles, in the same grid. */
  afterFolders?: ReactNode;
  /** Under the path line: a notice, say. */
  children?: ReactNode;
}

/** The path line, then the folders and lessons of one folder. What each tile is and does is up to the one who composes it. */
export function LibraryBrowser({ view, openId, onOpen, renderLesson, renderFolder, afterFolders, children }: LibraryBrowserProps) {
  const libraryRef = useFocusTarget(focusKey.library);
  const folders = view.tree.shownChildren(openId, view.visible);
  const here = view.lessonsByFolder.get(openId) ?? [];
  const empty = folders.length === 0 && here.length === 0;

  return (
    <section ref={libraryRef} tabIndex={-1} className="stack library">
      {openId !== null && <PathLine tree={view.tree} openId={openId} onOpen={onOpen} />}
      {children}
      {(folders.length > 0 || afterFolders) && (
        <div className="grid library__folders">
          {folders.map((folder, index) => renderFolder?.(folder, folders[index + 1]) ?? <FolderTile key={folder.id} folder={folder} holds={view.counts.get(folder.id) ?? 0} onOpen={onOpen} />)}
          {afterFolders}
        </div>
      )}
      {here.length > 0 && (
        <div className="grid library__lessons">
          {here.map((lesson) => (
            <Fragment key={lesson.id}>{renderLesson(lesson)}</Fragment>
          ))}
        </div>
      )}
      {empty && <p className="muted">{openId === null ? t.home.noLessons : t.library.emptyFolder}</p>}
    </section>
  );
}
