import { useState } from 'react';
import type { SiteContent } from '../../domain/models';
import { canViewLesson } from '../../domain/lessonOps';
import { questionSlides } from '../../domain/scoring';
import { t } from '../../i18n';
import logoRose from '../assets/brand/logo-rose.jpg';
import { Loading } from '../common/PageState';
import type { FieldSpec } from '../forms/SchemaForm';
import { SchemaForm } from '../forms/SchemaForm';
import { useAdmin, useLessons, useLiveSessions, useSite, useTeachers } from '../hooks/data';
import { JoinByCode } from '../join/JoinByCode';
import { LessonImportDialog } from '../lesson/LessonImportDialog';
import { navigate } from '../routing/routes';
import { RouteLink } from '../routing/useRoute';
import { LiveSessionList } from '../session/SessionLists';
import { TeachersPanel } from '../session/TeachersPanel';
import { useServices } from '../ServicesContext';
import { AdminPanel } from '../shell/AdminPanel';
import './home.css';

const th = t.home;

const SITE_FIELDS: readonly FieldSpec<SiteContent>[] = [
  { kind: 'text', key: 'schoolName', label: th.siteField.schoolName },
  { kind: 'text', key: 'title', label: th.siteField.title },
  { kind: 'text', key: 'tagline', label: th.siteField.tagline },
  { kind: 'textarea', key: 'intro', label: th.siteField.intro },
];

function TeacherNames() {
  const teachers = useTeachers();
  if (!teachers?.length) return null;
  return <p className="muted">{th.teachersLine(teachers.map((teacher) => teacher.name))}</p>;
}

function VisitorJoin() {
  const live = useLiveSessions();
  const admin = useAdmin();
  if (!live?.length || admin) return null;
  return (
    <section className="stack stack--tight">
      <p className="notice">{th.liveNowVisitor}</p>
      <JoinByCode />
    </section>
  );
}

function AdminLiveNotice() {
  const live = useLiveSessions();
  const admin = useAdmin();
  if (!live?.length || !admin) return null;
  return (
    <div className="notice">
      <LiveSessionList sessions={live} page="session" />
    </div>
  );
}

function LessonsGrid() {
  const lessons = useLessons();
  const admin = useAdmin();
  if (!lessons) return <Loading />;
  const visible = lessons.filter((lesson) => canViewLesson(lesson, admin));
  if (visible.length === 0) return <p className="muted">{th.noLessons}</p>;
  return (
    <div className="grid">
      {visible.map((lesson) => (
        <RouteLink key={lesson.id} to={{ name: 'lesson', lessonId: lesson.id, slideIndex: 0 }} className="card lesson-card">
          <h3 className="card__title">{lesson.title}</h3>
          <p className="muted">{t.common.subjectGrade(lesson.subject, lesson.grade)}</p>
          <div className="row">
            <span className="chip">{t.common.slideCount(lesson.slides.length)}</span>
            <span className="chip">{th.questionCount(questionSlides(lesson).length)}</span>
            {admin && !lesson.published && <span className="chip chip--bad">{th.unpublished}</span>}
          </div>
        </RouteLink>
      ))}
    </div>
  );
}

function HomeAdminPanels({ site }: { site: SiteContent }) {
  const { content, lessons } = useServices();
  const [importing, setImporting] = useState(false);

  const create = async () => {
    const lesson = await lessons.create(th.panel.newLessonTitle, null);
    navigate({ name: 'lesson', lessonId: lesson.id, slideIndex: 0 });
  };

  return (
    <>
      <AdminPanel title={th.panel.site}>
        <SchemaForm fields={SITE_FIELDS} value={site} resetKey="site" onChange={(next) => void content.updateSite(next)} />
      </AdminPanel>
      <TeachersPanel />
      <AdminPanel title={th.panel.lessons}>
        <div className="stack stack--tight">
          <button type="button" className="btn btn--primary" onClick={() => void create()}>
            {th.panel.newLesson}
          </button>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            {th.panel.importLesson}
          </button>
        </div>
        {importing && <LessonImportDialog onClose={() => setImporting(false)} />}
      </AdminPanel>
    </>
  );
}

/** The public front page: a visitor's way into a live class, the school hero and the lessons. */
export function HomePage() {
  const site = useSite();
  if (!site) return <Loading />;
  return (
    <div className="page">
      <VisitorJoin />
      <header className="hero pearl-veil">
        <div className="hero__text">
          <span className="chip chip--accent">{site.schoolName}</span>
          <h1 className="page__title rose-gold">{site.title}</h1>
          <p className="hero__tagline">{site.tagline}</p>
          <p>{site.intro}</p>
          <TeacherNames />
        </div>
        <img className="hero__poster" src={logoRose} alt={site.title} width={1296} height={830} />
      </header>
      <AdminLiveNotice />
      <section className="stack">
        <h2>{th.lessonsTitle}</h2>
        <LessonsGrid />
      </section>
      <HomeAdminPanels site={site} />
    </div>
  );
}
