import type { Lesson, Slide } from '../../domain/models';
import { LESSON_FILE } from '../../domain/lessonFormat';
import { addSlide, duplicateSlide, indexAfterRemoval, moveSlide, normalizeSlide, removeSlide, slideHasProblem, updateSlide } from '../../domain/lessonOps';
import { SLIDE_KIND_NAMES } from '../../domain/slideKinds';
import { t } from '../../i18n';
import { ConfirmButton } from '../common/ConfirmButton';
import { useAttempt } from '../common/useAttempt';
import { SchemaForm, type FieldSpec } from '../forms/SchemaForm';
import { useLiveSessions } from '../hooks/data';
import { homeRoute, navigate } from '../routing/routes';
import { useServices } from '../ServicesContext';
import { StartForm } from '../session/StartForm';
import { AdminPanel } from '../shell/AdminPanel';
import { slideUi } from '../slides/slideUi';
import { downloadText } from '../common/downloadText';

const tl = t.lesson;

type LessonMeta = Pick<Lesson, 'title' | 'subject' | 'grade' | 'published'>;

const META_FIELDS: readonly FieldSpec<LessonMeta>[] = [
  { kind: 'text', key: 'title', label: tl.field.title },
  { kind: 'text', key: 'subject', label: tl.field.subject },
  { kind: 'text', key: 'grade', label: tl.field.grade },
  { kind: 'boolean', key: 'published', label: tl.field.published },
];

function goTo(lessonId: string, slideIndex: number) {
  navigate({ name: 'lesson', lessonId, slideIndex }, { replace: true });
}

type Attempt = ReturnType<typeof useAttempt>['attempt'];

/** Saves a lesson; a refusal becomes a notice instead of an uncaught error. */
type SaveLesson = (lesson: Lesson) => Promise<boolean>;

function LessonMetaPanel({ lesson, save, attempt }: { lesson: Lesson; save: SaveLesson; attempt: Attempt }) {
  const { lessons } = useServices();
  const live = useLiveSessions();
  const meta: LessonMeta = { title: lesson.title, subject: lesson.subject, grade: lesson.grade, published: lesson.published };

  const remove = async () => {
    if (await attempt(() => lessons.remove(lesson.id))) navigate(homeRoute(lesson.folderId ?? null));
  };

  return (
    <AdminPanel title={tl.panel.lesson}>
      <div className="stack">
        <SchemaForm fields={META_FIELDS} value={meta} resetKey={lesson.id} onChange={(next) => void save({ ...lesson, ...next })} />
        {live && live.length > 0 && <p className="notice">{tl.runningClasses(live.length)}</p>}
        <StartForm lessonId={lesson.id} />
        <button type="button" className="btn" onClick={() => downloadText(`${lesson.title || tl.untitledFile}.${LESSON_FILE.extension}`, lessons.exportToText(lesson), LESSON_FILE.mimeType)}>
          {tl.export}
        </button>
        <ConfirmButton onConfirm={() => void remove()}>{tl.delete}</ConfirmButton>
      </div>
    </AdminPanel>
  );
}

function SlideRow({ lesson, slide, index, currentIndex, save }: { lesson: Lesson; slide: Slide; index: number; currentIndex: number; save: SaveLesson }) {
  const move = (delta: number) => {
    void save(moveSlide(lesson, slide.id, delta));
    goTo(lesson.id, index + delta);
  };
  return (
    <li className="slide-row" aria-current={index === currentIndex ? 'true' : undefined}>
      <button type="button" className="slide-row__main" onClick={() => goTo(lesson.id, index)}>
        <b>{index + 1}</b>
        <span className="chip">{slideUi(slide.kind).label}</span>
        <span className="slide-row__title">{slide.title || tl.slides.untitled}</span>
        {slideHasProblem(slide) && (
          <span className="chip chip--bad" role="img" aria-label={tl.slides.problem}>
            !
          </span>
        )}
      </button>
      <div className="row">
        <button type="button" className="btn btn--small" disabled={index === 0} onClick={() => move(-1)}>
          {tl.slides.moveUp}
        </button>
        <button type="button" className="btn btn--small" disabled={index === lesson.slides.length - 1} onClick={() => move(1)}>
          {tl.slides.moveDown}
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            void save(duplicateSlide(lesson, slide.id)).then((saved) => saved && goTo(lesson.id, index + 1));
          }}
        >
          {tl.slides.copy}
        </button>
        <ConfirmButton
          className="btn btn--small btn--danger"
          onConfirm={() => {
            void save(removeSlide(lesson, slide.id));
            goTo(lesson.id, indexAfterRemoval(currentIndex, index, lesson.slides.length));
          }}
        >
          {tl.slides.delete}
        </ConfirmButton>
      </div>
    </li>
  );
}

function SlidesPanel({ lesson, index, save }: { lesson: Lesson; index: number; save: SaveLesson }) {
  const add = async (kind: Slide['kind']) => {
    const after = lesson.slides.length === 0 ? -1 : index;
    const added = addSlide(lesson, kind, after);
    if (!(await save(added.lesson))) return;
    goTo(lesson.id, added.lesson.slides.findIndex((s) => s.id === added.slide.id));
  };
  return (
    <AdminPanel title={tl.panel.slides}>
      <div className="stack">
        <ol className="slide-list list-reset">
          {lesson.slides.map((slide, i) => (
            <SlideRow key={slide.id} lesson={lesson} slide={slide} index={i} currentIndex={index} save={save} />
          ))}
        </ol>
        <strong>{tl.slides.addTitle}</strong>
        <div className="row">
          {SLIDE_KIND_NAMES.map((kind) => (
            <button key={kind} type="button" className="btn btn--small" onClick={() => void add(kind)}>
              {tl.slides.add(slideUi(kind).label)}
            </button>
          ))}
        </div>
      </div>
    </AdminPanel>
  );
}

function SlideEditPanel({ lesson, slide, save }: { lesson: Lesson; slide: Slide; save: SaveLesson }) {
  return (
    <AdminPanel title={tl.panel.editSlide}>
      <SchemaForm
        fields={slideUi(slide.kind).fields}
        value={slide}
        resetKey={slide.id}
        normalize={normalizeSlide}
        onChange={(next) => void save(updateSlide(lesson, next))}
      />
    </AdminPanel>
  );
}

/** The three admin panels of the lesson page: lesson settings, slide list, slide editor. */
export function LessonEditorPanels({ lesson, index }: { lesson: Lesson; index: number }) {
  const { lessons } = useServices();
  const { error, attempt } = useAttempt();
  const save: SaveLesson = (next) => attempt(() => lessons.save(next));
  const slide: Slide | undefined = lesson.slides[index];
  return (
    <>
      {error && <p className="notice notice--bad">{error}</p>}
      <LessonMetaPanel lesson={lesson} save={save} attempt={attempt} />
      <SlidesPanel lesson={lesson} index={index} save={save} />
      {slide && <SlideEditPanel lesson={lesson} slide={slide} save={save} />}
    </>
  );
}
