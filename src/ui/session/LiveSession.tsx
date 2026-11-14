import { useEffect, useRef, useState } from 'react';
import { awaitingAdmission } from '../../domain/admission';
import { takesAnswerPerStudent, isQuestion, isRevealed, tallyAnswerers } from '../../domain/answering';
import type { Session } from '../../domain/models';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useAdmin, useAnswers, useLesson, useParticipants, useSessionRoster } from '../hooks/data';
import { useFullscreen } from '../hooks/useFullscreen';
import { AdmissionScanner } from '../scanner/AdmissionScanner';
import { CardScanner } from '../scanner/CardScanner';
import { AdmissionPanel } from './AdmissionPanel';
import { ClassCodeChip } from './ClassCodeChip';
import { ClassPanel } from './ClassPanel';
import { JoinCodes } from './JoinCodes';
import { PearlCorner } from './pearlPanel/PearlCorner';
import { usePearlPanel } from './pearlPanel/usePearlPanel';
import { MessagePanel } from './MessagePanel';
import { PacingPanel } from './PacingPanel';
import { PresenterBar } from './PresenterBar';
import { PresenterStage } from './PresenterStage';
import { SessionGroups } from './SessionGroups';
import { WaitingCountButton } from './WaitingCountButton';

/** The presenter and control console for a live class. */
export function LiveSession({ session }: { session: Session }) {
  const lesson = useLesson(session.lessonId);
  const roster = useSessionRoster(session);
  const answers = useAnswers(session.id);
  const participants = useParticipants(session.id);
  const presenterRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(presenterRef);
  const admin = useAdmin();
  const [showCodes, setShowCodes] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [regrouping, setRegrouping] = useState(false);
  const [scanSlideId, setScanSlideId] = useState<string | null>(null);
  const pearl = usePearlPanel();

  const waiting = participants ? awaitingAdmission(participants).length : 0;
  const slide = lesson?.slides[session.slideIndex];
  const revealed = slide ? isRevealed(session, slide.id) : false;

  // The scanner belongs to one visit of one open question: leaving the slide or revealing it ends it.
  useEffect(() => setScanSlideId(null), [slide?.id, revealed]);

  if (lesson === undefined || !roster || !answers || !participants) return <Loading />;
  const { groups, students } = roster;
  const regroupOverlay = regrouping && <SessionGroups session={session} onClose={() => setRegrouping(false)} />;

  if (!lesson) {
    return (
      <div className="page session">
        <p className="notice notice--bad">{t.session.lessonDeleted}</p>
        <ClassPanel session={session} lesson={null} onRegroup={() => setRegrouping(true)} />
        {regroupOverlay}
      </div>
    );
  }

  const scannable = slide && takesAnswerPerStudent(session, slide) ? slide : null;
  const scanning = scannable !== null && scanSlideId === scannable.id;
  const tally = slide && isQuestion(slide) ? tallyAnswerers(slide, roster, participants, answers) : null;

  return (
    <div className="page session">
      <div ref={presenterRef} className="presenter">
        <div className="presenter__main">
          <div className="session__stage">
            <div className="presenter__corner">
              {!showCodes && <ClassCodeChip code={session.code} />}
              {admin && waiting > 0 && (
                <WaitingCountButton className="session__waiting" count={waiting} onPress={() => fullscreen.active && fullscreen.toggle()} />
              )}
            </div>
            <div className="presenter__frame">
              <div className="presenter__content">
                {showCodes ? (
                  <JoinCodes session={session} groups={groups} students={students} participants={participants} />
                ) : (
                  <PresenterStage
                    session={session}
                    slide={slide}
                    answers={answers}
                    roster={roster}
                    participants={participants}
                    tally={tally}
                    onOpenPanel={pearl.open ? null : pearl.openOnOverview}
                  />
                )}
              </div>
              <PearlCorner
                open={pearl.open}
                waiting={tally?.waiting.length ?? 0}
                onToggle={pearl.toggle}
                tab={pearl.tab}
                onTab={pearl.select}
                session={session}
                lesson={lesson}
                slide={slide}
                roster={roster}
                participants={participants}
                answers={answers}
              />
            </div>
          </div>
        </div>
        <PresenterBar
          session={session}
          slide={slide}
          slideCount={lesson.slides.length}
          keyboard={!scanning && !admitting && !regrouping}
          codesShown={showCodes}
          onToggleCodes={() => setShowCodes(!showCodes)}
          scan={scannable ? { on: scanning, toggle: () => setScanSlideId(scanning ? null : scannable.id) } : null}
          fullscreen={fullscreen}
        />
        {scanning && scannable && (
          <CardScanner session={session} slide={scannable} roster={roster} participants={participants} answers={answers} onClose={() => setScanSlideId(null)} />
        )}
      </div>

      {regroupOverlay}

      {admitting && <AdmissionScanner session={session} roster={roster} participants={participants} onClose={() => setAdmitting(false)} />}

      <AdmissionPanel sessionId={session.id} participants={participants} roster={roster} onScan={() => setAdmitting(true)} />
      <PacingPanel session={session} groups={groups} />
      <MessagePanel session={session} groups={groups} />
      <ClassPanel session={session} lesson={lesson} onRegroup={() => setRegrouping(true)} />
    </div>
  );
}
