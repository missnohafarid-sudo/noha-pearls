import { useEffect, useMemo, useState } from 'react';
import { answersForWholeGroup, canAnswer, deviceAnswer, isQuestion } from '../../domain/answering';
import { RewardIndex } from '../../domain/analytics';
import { seatAnswerer } from '../../domain/admission';
import type { Group, Participant, Session, SessionRoster } from '../../domain/models';
import { messageFor, resolveStudentView } from '../../domain/pacing';
import { pearlsEarned, publishedKeys, scoreboard } from '../../domain/scoring';
import { peerRewardTargets } from '../../domain/rewards';
import { studentById } from '../../domain/roster';
import { t } from '../../i18n';
import { useAnswers, useLesson, useRewards } from '../hooks/data';
import { OwnResults } from '../board/OwnResults';
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
  roster: SessionRoster;
  /** Gives the seat up and returns to the name list. */
  onChooseName: () => void;
}

/** What a joined student device shows: header, teacher message, the current slide, pacing and peer hearts. */
export function DeviceScreen({ session, group, participant, roster, onChooseName }: DeviceScreenProps) {
  const { answers: answerService, rewards: rewardService } = useServices();
  const lesson = useLesson(session.lessonId);
  const answers = useAnswers(session.id);
  const rewards = useRewards(session.id);
  const [showResults, setShowResults] = useState(false);
  const [ownIndex, setOwnIndex] = useState(session.slideIndex);
  const index = useMemo(() => new RewardIndex(rewards ?? []), [rewards]);

  const view = lesson && lesson.slides.length > 0 ? resolveStudentView(session, group.id, lesson.slides.length, ownIndex) : null;
  const shownIndex = view?.state === 'slide' && !view.selfPaced ? view.slideIndex : null;
  // Free pacing starts from the slide the group is already on.
  useEffect(() => {
    if (shownIndex !== null) setOwnIndex(shownIndex);
  }, [shownIndex]);

  const pearls = useMemo(() => {
    if (!lesson || !answers) return 0;
    const score = scoreboard(lesson, roster, answers, publishedKeys(session)).find((entry) => entry.groupId === group.id);
    return score ? pearlsEarned(score) : 0;
  }, [lesson, answers, group, roster, session]);

  if (lesson === undefined || answers === undefined || rewards === undefined) return <Loading />;

  const student = studentById(roster.students, participant.studentId);
  const header = (
    <>
      <DeviceHeader
        group={group}
        pearls={pearls}
        onChooseName={onChooseName}
        student={
          student && {
            name: student.name,
            hearts: index.of({ kind: 'student', id: student.id }).total,
            resultsShown: showResults,
            onToggleResults: () => setShowResults((shown) => !shown),
          }
        }
      />
      <LeaveLink />
    </>
  );

  const results = student && showResults && lesson && (
    <OwnResults
      session={session}
      lesson={lesson}
      roster={roster}
      answers={answers}
      student={student}
      group={group}
      hearts={index.of({ kind: 'student', id: student.id })}
      onHide={() => setShowResults(false)}
    >
      <OwnStandings session={session} />
    </OwnResults>
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

  const heartTargets = peerRewardTargets(session, participant, roster.students);
  const message = messageFor(session, group.id);
  const slide = view.state === 'slide' ? lesson.slides[view.slideIndex] : null;
  const question = slide && isQuestion(slide) ? slide : null;
  const shown = question && deviceAnswer(roster, answers, question, seatAnswerer(participant, roster.students));
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
      {heartTargets.length > 0 && (
        <PeerHearts
          targets={heartTargets}
          heartsOf={(id) => index.of({ kind: 'student', id }).total}
          onGive={(classmate) => void rewardService.giveAsPeer(session.id, classmate.id)}
        />
      )}
    </div>
  );
}
