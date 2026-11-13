import type { Id, LessonSummary } from '../../domain/models';
import { t } from '../../i18n';
import { RouteLink } from '../routing/useRoute';
import { useDragSource } from './useDragMove';

function LessonCardBody({ lesson, admin }: { lesson: LessonSummary; admin: boolean }) {
  return (
    <>
      <h3 className="card__title">{lesson.title}</h3>
      <p className="muted">{t.common.subjectGrade(lesson.subject, lesson.grade)}</p>
      <div className="row">
        <span className="chip">{t.common.slideCount(lesson.slideCount)}</span>
        <span className="chip">{t.home.questionCount(lesson.questionCount)}</span>
        {admin && !lesson.published && <span className="chip chip--bad">{t.home.unpublished}</span>}
      </div>
    </>
  );
}

interface LessonCardProps {
  lesson: LessonSummary;
  admin: boolean;
  /** The folder the lesson shows in, for dragging it from there. */
  from?: Id | null;
  /** Present for the admin on the home page: the card can then be moved. */
  onMove?: () => void;
}

/** A lesson on the home page: it opens the lesson; the admin can also move it. */
export function LessonCard({ lesson, admin, from = null, onMove }: LessonCardProps) {
  const { props: source, dragging } = useDragSource({ kind: 'lesson', id: lesson.id, from });
  return (
    <div className={`lesson-tile${dragging ? ' is-dragging' : ''}`} {...source}>
      <RouteLink to={{ name: 'lesson', lessonId: lesson.id, slideIndex: 0 }} className="card lesson-card">
        <LessonCardBody lesson={lesson} admin={admin} />
      </RouteLink>
      {onMove && (
        <button type="button" className="quiet-action lesson-tile__move" aria-label={t.library.moveLesson(lesson.title)} onClick={onMove}>
          {t.library.moveWord}
        </button>
      )}
    </div>
  );
}

/** A lesson in the class chooser: pressing its button picks it. */
export function PickableLessonCard({ lesson, chosen, onPick }: { lesson: LessonSummary; chosen: boolean; onPick: () => void }) {
  return (
    <div className="card lesson-card">
      <LessonCardBody lesson={lesson} admin={false} />
      <button type="button" className="btn" aria-pressed={chosen} onClick={onPick}>
        {t.session.pickLesson}
      </button>
    </div>
  );
}
