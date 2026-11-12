import type { ReactNode } from 'react';
import { ErrorBoundary } from './common/ErrorBoundary';
import { NotFound } from './common/PageState';
import { useAdmin } from './hooks/data';
import { BoardPage } from './pages/BoardPage';
import { CardsPage } from './pages/CardsPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { LessonPage } from './pages/LessonPage';
import { MonitorPage } from './pages/MonitorPage';
import { RosterPage } from './pages/RosterPage';
import { SessionPage } from './pages/SessionPage';
import { StandingsPage } from './pages/StandingsPage';
import { ADMIN_ROUTES, BARE_ROUTES, type Route } from './routing/routes';
import { useRoute } from './routing/useRoute';
import { AppShell } from './shell/AppShell';

function pageFor(route: Route): ReactNode {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'lesson':
      return <LessonPage lessonId={route.lessonId} slideIndex={route.slideIndex} />;
    case 'board':
      return <BoardPage code={route.code} />;
    case 'session':
      return <SessionPage code={route.code} />;
    case 'monitor':
      return <MonitorPage code={route.code} />;
    case 'roster':
      return <RosterPage classId={route.classId} />;
    case 'cards':
      return <CardsPage classId={route.classId} />;
    case 'standings':
      return <StandingsPage classId={route.classId} />;
    case 'join':
      return <JoinPage code={route.code} groupId={route.groupId} />;
    case 'notFound':
      return <NotFound />;
  }
}

export function App() {
  const route = useRoute();
  const admin = useAdmin();
  // Admin pages do not exist for visitors: they get the same "not found" as any bad link.
  const page = ADMIN_ROUTES.has(route.name) && !admin ? <NotFound /> : pageFor(route);

  return (
    <>
      {BARE_ROUTES.has(route.name) ? (
        <ErrorBoundary key={route.name}>{page}</ErrorBoundary>
      ) : (
        <AppShell route={route}>
          <ErrorBoundary key={route.name}>{page}</ErrorBoundary>
        </AppShell>
      )}
    </>
  );
}
