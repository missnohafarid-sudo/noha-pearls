import { seatAnswerer } from '../domain/admission';
import { answerId, canAnswer, canScanCards, normalizeAnswerValue, subjectFor } from '../domain/answering';
import type { Answer, AnswerSource, Id, QuestionSlide, Student } from '../domain/models';
import { studentById } from '../domain/roster';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import type { SeatSource } from './SeatSource';
import type { PresenceMarker } from './PresenceMarker';
import type { SessionRosterSource } from './SessionRosterSource';

/**
 * Records answers, whatever their source: a student's device, an answer card,
 * or the teacher by hand. Every path asks the domain who the answer belongs to
 * and whether the question, as stored right now, still accepts answers.
 */
export class AnswerService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly seats: SeatSource,
    private readonly rosters: SessionRosterSource,
    private readonly presence: PresenceMarker,
  ) {}

  watchAnswers(sessionId: Id, listener: (answers: Answer[]) => void): Unsubscribe {
    return this.store.watch('answers', { sessionId }, listener);
  }

  /**
   * This device answers for its own student, or for its group on a group question. Judged on the seat the device
   * holds as stored, in the group her student is in now: a device that has not been let in cannot answer.
   * Returns false when not accepted.
   */
  async submitFromDevice(sessionId: Id, slideId: Id, value: unknown): Promise<boolean> {
    const seat = await this.seats.admittedSeat(sessionId);
    const question = seat && (await this.openQuestion(sessionId, slideId));
    if (!seat || !question) return false;
    const { students } = await this.rosters.rosterOf(sessionId);
    return this.record(sessionId, question, seatAnswerer(seat, students), value, 'device');
  }

  /**
   * Admin only: an answer entered for a student of the session's roster from a card scan or by hand. Her group is
   * read from the roster. Individual choice questions only. She joins the roll if one was taken. Returns false when not accepted.
   */
  async submitForStudent(
    sessionId: Id,
    slideId: Id,
    studentId: Id,
    value: unknown,
    source: 'card' | 'manual',
  ): Promise<boolean> {
    requireAdmin(this.caller);
    const [student, question] = await Promise.all([this.studentOf(sessionId, studentId), this.openQuestion(sessionId, slideId, true)]);
    if (!student || !question) return false;
    const recorded = await this.record(sessionId, question, { groupId: student.groupId, studentId: student.id }, value, source);
    if (recorded) await this.presence.addToRoll(sessionId, [student.id]);
    return recorded;
  }

  /** Admin only: withdraws a student's answer while an individual choice question is still open. */
  async clearForStudent(sessionId: Id, slideId: Id, studentId: Id): Promise<void> {
    requireAdmin(this.caller);
    const [student, question] = await Promise.all([this.studentOf(sessionId, studentId), this.openQuestion(sessionId, slideId, true)]);
    const subject = student && question && subjectFor(question, { groupId: student.groupId, studentId: student.id });
    if (subject) await this.store.remove('answers', answerId(sessionId, slideId, subject));
  }

  private async studentOf(sessionId: Id, studentId: Id): Promise<Student | null> {
    return studentById((await this.rosters.rosterOf(sessionId)).students, studentId);
  }

  private async record(
    sessionId: Id,
    question: QuestionSlide,
    answerer: { groupId: Id; studentId: Id | null },
    value: unknown,
    source: AnswerSource,
  ): Promise<boolean> {
    const subject = subjectFor(question, answerer);
    const normalized = normalizeAnswerValue(question, value);
    if (!subject || normalized === null) return false;
    await this.store.put('answers', {
      id: answerId(sessionId, question.id, subject),
      sessionId,
      slideId: question.id,
      subject,
      value: normalized,
      source,
      at: Date.now(),
    });
    return true;
  }

  /**
   * The question as stored in the session's lesson, if the session as stored right now still accepts
   * answers to it. With `byCard`, only questions that cards and manual entry may answer.
   */
  private async openQuestion(sessionId: Id, slideId: Id, byCard = false): Promise<QuestionSlide | null> {
    const session = await this.store.get('sessions', sessionId);
    const lesson = session && (await this.store.get('lessons', session.lessonId));
    const slide = lesson?.slides.find((s) => s.id === slideId);
    if (!session || !slide) return null;
    if (byCard) return canScanCards(session, slide) ? slide : null;
    return canAnswer(session, slide) ? slide : null;
  }
}
