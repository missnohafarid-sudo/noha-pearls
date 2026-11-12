import { useEffect, useState } from 'react';
import type { FolderTree } from '../../domain/folders';
import type { Id, SiteContent } from '../../domain/models';
import { t } from '../../i18n';
import logoRose from '../assets/brand/logo-rose.jpg';
import { Loading } from '../common/PageState';
import type { FieldSpec } from '../forms/SchemaForm';
import { SchemaForm } from '../forms/SchemaForm';
import { useAdmin, useLiveSessions, useSite, useTeachers } from '../hooks/data';
import { JoinByCode } from '../join/JoinByCode';
import { LessonImportDialog } from '../lesson/LessonImportDialog';
import { ManagedLibrary } from '../library/ManagedLibrary';
import { pathText } from '../library/place';
import { PublicLibrary } from '../library/PublicLibrary';
import { useLibraryView, type LibraryView } from '../library/useLibraryView';
import { useAttempt } from '../common/useAttempt';
import { homeRoute, navigate } from '../routing/routes';
import { useRoute } from '../routing/useRoute';
import { LiveSessionList } from '../session/SessionLists';
import { TeachersPanel } from '../session/TeachersPanel';
import { useServices } from '../ServicesContext';
import { AdminPanel } from '../shell/AdminPanel';
import './home.css';

const th = t.home;
const tl = t.library;

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

function HomeAdminPanels({ site, tree, openId }: { site: SiteContent; tree: FolderTree | undefined; openId: Id | null }) {
  const { content, lessons } = useServices();
  const [importing, setImporting] = useState(false);

  const { error, attemptWith } = useAttempt();

  const create = async () => {
    const made = await attemptWith(() => lessons.create(th.panel.newLessonTitle, openId));
    if (made) navigate({ name: 'lesson', lessonId: made.value.id, slideIndex: 0 });
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
          {error && <p className="notice notice--bad">{error}</p>}
          {tree && <p className="muted">{tl.keptIn(pathText(tree, openId))}</p>}
        </div>
        {importing && <LessonImportDialog folderId={openId} onClose={() => setImporting(false)} />}
      </AdminPanel>
    </>
  );
}

function Library({ view, openId }: { view: LibraryView; openId: Id | null }) {
  const open = (folderId: Id | null) => navigate(homeRoute(folderId));
  return view.admin ? <ManagedLibrary view={view} openId={openId} onOpen={open} /> : <PublicLibrary view={view} openId={openId} onOpen={open} />;
}

/** The public front page: a visitor's way into a live class, the school hero and the lessons. */
export function HomePage() {
  const site = useSite();
  const route = useRoute();
  const view = useLibraryView('browse');
  const requestedId = route.name === 'home' ? route.folderId : undefined;
  const openId = view?.folderToShow(requestedId) ?? null;
  const addressIsDead = view !== undefined && requestedId !== undefined && openId === null;

  useEffect(() => {
    if (addressIsDead) navigate(homeRoute(null), { replace: true });
  }, [addressIsDead]);

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
        {view ? <Library view={view} openId={openId} /> : <Loading />}
      </section>
      <HomeAdminPanels site={site} tree={view?.tree} openId={openId} />
    </div>
  );
}
