import { useEffect, useState } from 'react';
import { answersForWholeGroup, canAnswer, isQuestion } from '../../domain/answering';
import type { Group, Participant, Session } from '../../domain/models';
import { messageFor, resolveStudentView } from '../../domain/pacing';
import { resultsReport } from '../../domain/resultRows';
import { studentById } from '../../domain/roster';
import type { SeenRoster } from '../../domain/visibility';
import { t } from '../../i18n';
import { useLessonOf, useSeatView } from '../hooks/data';
import { MyResults } from '../board/MyResults';
import { Loading } from '../common/PageState';
import { useServices } from '../ServicesContext';
import { SlideNav } from '../slides/SlideNav';
import { SlideView } from '../slides/SlideView';
import { OwnStandings } from '../standings/OwnStandings';
import { DeviceHeader } from './DeviceHeader';
import { LeaveLink } from './LeaveLink';
import { PeerHearts } from './PeerHearts';
import { StatusMessage } from './StatusMessage';

interface DeviceScreenProps {
  session: Session;
  group: Group;
  participant: Participant;
  roster: SeenRoster;
  /** Gives the seat up and returns to the name list. */
  onChooseName: () => void;
}

/** What a joined student device shows: header, teacher message, the current slide, pacing and peer hearts. */
export function DeviceScreen({ session, group, participant, roster, onChooseName }: DeviceScreenProps) {
  const { answers: answerService, rewards: rewardService } = useServices();
  const lesson = useLessonOf(session.id);
  const mine = useSeatView(session.id);
  const [showResults, setShowResults] = useState(false);
  const [ownIndex, setOwnIndex] = useState(session.slideIndex);

  const view = lesson && lesson.slides.length > 0 ? resolveStudentView(session, group.id, lesson.slides.length, ownIndex) : null;
  const shownIndex = view?.state === 'slide' && !view.selfPaced ? view.slideIndex : null;
  // Free pacing starts from the slide the group is already on.
  useEffect(() => {
    if (shownIndex !== null) setOwnIndex(shownIndex);
  }, [shownIndex]);

  if (lesson === undefined || !mine) return <Loading />;

  const student = studentById(roster.students, participant.studentId);
  const header = (
    <>
      <DeviceHeader
        group={group}
        pearls={mine.pearls}
        onChooseName={onChooseName}
        student={
          student &&
          mine.own && {
            name: student.name,
            hearts: mine.own.hearts.total,
            resultsShown: showResults,
            onToggleResults: () => setShowResults((shown) => !shown),
          }
        }
      />
      <LeaveLink />
    </>
  );

  const results = student && showResults && mine.own?.report && (
    <MyResults student={student} group={group} report={resultsReport(mine.own.report)} hearts={mine.own.hearts} onHide={() => setShowResults(false)}>
      <OwnStandings session={session} />
    </MyResults>
  );

  if (!lesson || !view) {
    return (
      <div className="stack">
        {header}
        {results}
        <div className="pearl-veil">
          <StatusMessage title={t.join.waitingLesson} />
        </div>
      </div>
    );
  }

  const message = messageFor(session, group.id);
  const slide = view.state === 'slide' ? lesson.slides[view.slideIndex] : null;
  const question = slide && isQuestion(slide) ? slide : null;
  const shown = question ? (mine.answers[question.id] ?? null) : null;
  const open = question !== null && canAnswer(session, question);

  return (
    <div className="stack">
      {header}
      {results}
      {message && <p className="notice">{message.text}</p>}
      {view.state === 'hold' && (
        <section className="card pearl-veil join__hold">
          <h1 className="page__title">{t.join.holdTitle}</h1>
          <p className="muted">{t.join.holdHint}</p>
        </section>
      )}
      {slide && (
        <>
          {open && answersForWholeGroup(question, participant) && <p className="notice">{t.join.answersForWholeGroup}</p>}
          {shown?.coveredByGroup && <p className="notice">{open ? t.join.groupAnswered : t.join.groupAnswerKept}</p>}
          <SlideView
            slide={slide}
            answer={shown?.answer.value ?? null}
            groupAnswer={shown?.coveredByGroup ? shown.answer.value : null}
            reveal={session.reveals[slide.id] ?? null}
            onAnswer={open ? (value) => void answerService.submitFromDevice(session.id, slide.id, value) : null}
          />
        </>
      )}
      {view.state === 'slide' && (
        <>
          {view.selfPaced && <SlideNav index={view.slideIndex} count={lesson.slides.length} onGo={setOwnIndex} />}
          <span className="chip join__pace">{view.selfPaced ? t.join.ownPace : t.join.followsTeacher}</span>
        </>
      )}
      <PeerHearts classmates={mine.classmates} onGive={(classmate) => void rewardService.giveAsPeer(session.id, classmate.id)} />
    </div>
  );
}
