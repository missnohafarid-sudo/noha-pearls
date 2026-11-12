import { useEffect, useRef, useState } from 'react';
import { awaitingAdmission } from '../../domain/admission';
import { canScanCards, isQuestion, isRevealed } from '../../domain/answering';
import type { Session } from '../../domain/models';
import { t } from '../../i18n';
import { Loading } from '../common/PageState';
import { useAdmin, useAnswers, useLesson, useParticipants, useSessionRoster } from '../hooks/data';
import { useFullscreen } from '../hooks/useFullscreen';
import { AdmissionScanner } from '../scanner/AdmissionScanner';
import { CardScanner } from '../scanner/CardScanner';
import { useServices } from '../ServicesContext';
import { SlideNav } from '../slides/SlideNav';
import { AdmissionPanel } from './AdmissionPanel';
import { ClassPanel } from './ClassPanel';
import { JoinCodes } from './JoinCodes';
import { MessagePanel } from './MessagePanel';
import { PacingPanel } from './PacingPanel';
import { PresenterStage } from './PresenterStage';
import { SessionGroups } from './SessionGroups';
import { WaitingCountButton } from './WaitingCountButton';

/** The presenter and control console for a live class. */
export function LiveSession({ session }: { session: Session }) {
  const { sessions } = useServices();
  const lesson = useLesson(session.lessonId);
  const roster = useSessionRoster(session);
  const answers = useAnswers(session.id);
  const participants = useParticipants(session.id);
  const stageRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(stageRef);
  const admin = useAdmin();
  const [showCodes, setShowCodes] = useState(false);
  const [admitting, setAdmitting] = useState(false);
  const [regrouping, setRegrouping] = useState(false);
  const [scanSlideId, setScanSlideId] = useState<string | null>(null);

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

  const scannable = slide && canScanCards(session, slide) ? slide : null;
  const scanning = scannable !== null && scanSlideId === scannable.id;

  return (
    <div className="page session">
      <div ref={stageRef} className="session__stage">
        {admin && waiting > 0 && (
          <WaitingCountButton className="session__waiting" count={waiting} onPress={() => fullscreen.active && fullscreen.toggle()} />
        )}
        {showCodes ? (
          <JoinCodes session={session} groups={groups} students={students} participants={participants} />
        ) : (
          <PresenterStage session={session} slide={slide} answers={answers} roster={roster} participants={participants} />
        )}
      </div>

      <div className="row session__controls">
        <SlideNav index={session.slideIndex} count={lesson.slides.length} onGo={(i) => void sessions.goTo(session.id, i)} keyboard={!scanning && !admitting && !regrouping} />
        {slide && isQuestion(slide) && (
          <button type="button" className="btn" disabled={revealed} onClick={() => void sessions.reveal(session.id, slide.id)}>
            {t.session.reveal}
          </button>
        )}
        {scannable && (
          <button type="button" className="btn" aria-pressed={scanning} onClick={() => setScanSlideId(scanning ? null : scannable.id)}>
            {scanning ? t.session.closeScan : t.session.scan}
          </button>
        )}
        <button type="button" className="btn" onClick={fullscreen.toggle}>
          {fullscreen.active ? t.common.exitFullscreen : t.common.fullscreen}
        </button>
        <button type="button" className="btn" aria-pressed={showCodes} onClick={() => setShowCodes(!showCodes)}>
          {showCodes ? t.session.showSlide : t.session.showJoinCodes}
        </button>
      </div>

      {scanning && scannable && (
        <CardScanner session={session} slide={scannable} roster={roster} participants={participants} answers={answers} onClose={() => setScanSlideId(null)} />
      )}

      {regroupOverlay}

      {admitting && <AdmissionScanner session={session} roster={roster} participants={participants} onClose={() => setAdmitting(false)} />}

      <AdmissionPanel sessionId={session.id} participants={participants} roster={roster} onScan={() => setAdmitting(true)} />
      <PacingPanel session={session} groups={groups} />
      <MessagePanel session={session} groups={groups} />
      <ClassPanel session={session} lesson={lesson} onRegroup={() => setRegrouping(true)} />
    </div>
  );
}
