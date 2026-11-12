import { useState } from 'react';
import { onlyOne } from '../../domain/lists';
import type { Id } from '../../domain/models';
import { t } from '../../i18n';
import { LessonPicker } from '../library/LessonPicker';
import { useLibraryView } from '../library/useLibraryView';
import { Loading } from '../common/PageState';
import { RouteLink } from '../routing/useRoute';
import { StartForm } from './StartForm';

/** Pick a lesson, then a class and a teacher, and start a class. */
export function StartSession() {
  const view = useLibraryView('pick');
  const [pickedId, setPickedId] = useState('');
  const [openedId, setOpenedId] = useState<Id | null | undefined>(undefined);
  if (!view) return <Loading />;
  const only = onlyOne(view.lessons);
  const chosen = only ?? view.lessons.find((lesson) => lesson.id === pickedId) ?? null;
  const openId = view.folderToShow(openedId === undefined ? (only ? view.tree.folderOf(only) : null) : openedId);

  return (
    <section className="stack">
      <h2 className="card__title">{t.session.startTitle}</h2>
      {view.lessons.length === 0 ? (
        <div className="stack">
          <p className="muted">{t.session.noLessons}</p>
          <RouteLink to={{ name: 'home' }} className="btn btn--primary">
            {t.common.backHome}
          </RouteLink>
        </div>
      ) : (
        <>
          <LessonPicker view={view} openId={openId} onOpen={setOpenedId} chosenId={chosen?.id} onPick={setPickedId} />
          {chosen && <StartForm lessonId={chosen.id} />}
        </>
      )}
    </section>
  );
}
