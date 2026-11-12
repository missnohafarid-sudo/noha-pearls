import { useRef, useState } from 'react';
import { isQuestion } from '../../domain/answering';
import { canViewLesson, clampIndex } from '../../domain/lessonOps';
import { answerKey } from '../../domain/scoring';
import { t } from '../../i18n';
import { Loading, NotFound } from '../common/PageState';
import { useAdmin, useLesson } from '../hooks/data';
import { useFullscreen } from '../hooks/useFullscreen';
import { LessonEditorPanels } from '../lesson/LessonEditorPanels';
import { navigate } from '../routing/routes';
import { SlideNav } from '../slides/SlideNav';
import { SlideView } from '../slides/SlideView';
import './lesson.css';

const tl = t.lesson;

/** One lesson, slide by slide, read-only for everyone; the admin gets the editor in the side panel. */
export function LessonPage({ lessonId, slideIndex }: { lessonId: string; slideIndex: number }) {
  const lesson = useLesson(lessonId);
  const admin = useAdmin();
  const stage = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stage);
  const [shownSlideId, setShownSlideId] = useState<string | null>(null);

  if (lesson === undefined) return <Loading />;
  if (lesson === null || !canViewLesson(lesson, admin)) return <NotFound />;

  const index = clampIndex(slideIndex, lesson.slides.length);
  const slide = lesson.slides[index];
  const reveal = admin && slide && isQuestion(slide) && shownSlideId === slide.id ? answerKey(slide) : null;

  return (
    <div className="page">
      <header className="stack stack--tight">
        <h1 className="page__title">{lesson.title}</h1>
        <p className="muted">{t.common.subjectGrade(lesson.subject, lesson.grade)}</p>
      </header>

      {slide ? (
        <>
          <div ref={stage} className="stage">
            <SlideView slide={slide} reveal={reveal} />
          </div>
          <div className="row row--between">
            <SlideNav
              index={index}
              count={lesson.slides.length}
              keyboard
              onGo={(next) => navigate({ name: 'lesson', lessonId, slideIndex: next }, { replace: true })}
            />
            <div className="row">
              {admin && isQuestion(slide) && (
                <button type="button" className="btn" aria-pressed={reveal !== null} onClick={() => setShownSlideId(reveal ? null : slide.id)}>
                  {reveal ? tl.hideAnswer : tl.showAnswer}
                </button>
              )}
              <button type="button" className="btn" onClick={fullscreen.toggle}>
                {fullscreen.active ? t.common.exitFullscreen : t.common.fullscreen}
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="muted">{tl.emptyLesson}</p>
      )}

      <LessonEditorPanels lesson={lesson} index={index} />
    </div>
  );
}
