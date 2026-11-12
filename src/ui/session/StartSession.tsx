import { useState } from 'react';
import { onlyOne } from '../../domain/lists';
import { t } from '../../i18n';
import { useLessons } from '../hooks/data';
import { Loading } from '../common/PageState';
import { RouteLink } from '../routing/useRoute';
import { StartForm } from './StartForm';

/** Pick a lesson, then a class and a teacher, and start a class. */
export function StartSession() {
  const lessons = useLessons();
  const [pickedId, setPickedId] = useState('');
  if (!lessons) return <Loading />;
  const chosen = onlyOne(lessons) ?? lessons.find((lesson) => lesson.id === pickedId) ?? null;

  return (
    <section className="stack">
      <h2 className="card__title">{t.session.startTitle}</h2>
      {lessons.length === 0 ? (
        <div className="stack">
          <p className="muted">{t.session.noLessons}</p>
          <RouteLink to={{ name: 'home' }} className="btn btn--primary">
            {t.common.backHome}
          </RouteLink>
        </div>
      ) : (
        <>
          <div className="grid">
            {lessons.map((lesson) => (
              <div key={lesson.id} className="card stack">
                <h2 className="card__title">{lesson.title}</h2>
                <p className="muted">{[t.common.subjectGrade(lesson.subject, lesson.grade), t.common.slideCount(lesson.slides.length)].filter(Boolean).join(' · ')}</p>
                <button type="button" className="btn" aria-pressed={chosen?.id === lesson.id} onClick={() => setPickedId(lesson.id)}>
                  {t.session.pickLesson}
                </button>
              </div>
            ))}
          </div>
          {chosen && <StartForm lessonId={chosen.id} />}
        </>
      )}
    </section>
  );
}
