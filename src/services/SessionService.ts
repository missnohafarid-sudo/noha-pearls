import { isQuestion } from '../domain/answering';
import { withMinInteractions } from '../domain/engagement';
import { newId } from '../domain/ids';
import { clampIndex } from '../domain/lessonOps';
import type { GroupPacing, Id, Lesson, PacingMode, Session } from '../domain/models';
import { pacingFor } from '../domain/pacing';
import { answerKey } from '../domain/scoring';
import { isOnRoster } from '../domain/roster';
import { acceptsChanges, isLive, newUniqueJoinCode, sessionBasis } from '../domain/sessions';
import { cleanMessage } from '../domain/text';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { AuthService } from './AuthService';
import type { ClassRosterSource } from './ClassRosterSource';
import type { RecordKeeper } from './RecordKeeper';
import type { SessionRosterSource } from './SessionRosterSource';

/** The teacher's controls over her classes. Any number can be live; starting one never touches another. */
export class SessionService {
  constructor(
    private readonly store: DocumentStore,
    private readonly auth: AuthService,
    private readonly classes: ClassRosterSource,
    private readonly rosters: SessionRosterSource,
    private readonly records: RecordKeeper,
  ) {}

  /** Every class, live or ended. */
  watchAll(listener: (sessions: Session[]) => void): Unsubscribe {
    return this.store.watch('sessions', {}, listener);
  }

  watchByCode(code: string, listener: (session: Session | null) => void): Unsubscribe {
    return this.store.watch('sessions', { code }, (sessions) => listener(sessions[0] ?? null));
  }

  /**
   * Starts a class of a lesson for a class and a teacher, remembering the names they have now and taking its own
   * copy of the class's groups and students, with the same ids. Returns null, storing nothing, unless all three
   * are stored and the class has a group.
   */
  async start(lessonId: Id, classId: Id, teacherId: Id): Promise<Session | null> {
    this.auth.requireAdmin();
    const [lesson, schoolClass, teacher] = await Promise.all([
      this.store.get('lessons', lessonId),
      this.store.get('classes', classId),
      this.store.get('teachers', teacherId),
    ]);
    const roster = await this.classes.rosterOfClass(classId);
    const basis = sessionBasis(lesson, schoolClass, teacher, roster.groups);
    if (!basis) return null;
    const session: Session = {
      id: newId(),
      code: newUniqueJoinCode(await this.store.list('sessions', {})),
      ...basis,
      status: 'live',
      slideIndex: 0,
      reveals: {},
      pacing: {},
      message: null,
      startedAt: Date.now(),
    };
    await this.store.put('rosters', { id: session.id, ...roster, present: null });
    await this.store.put('sessions', session);
    return session;
  }

  /** Ends the class, then has what it came to kept from the frozen answers and roll. Ending one that has ended is harmless and keeps a record it lacks. */
  async end(sessionId: Id): Promise<void> {
    this.auth.requireAdmin();
    await this.store.update('sessions', sessionId, (current) => (isLive(current) ? { ...current, status: 'ended' } : current));
    await this.records.keep(sessionId);
  }

  /** Moves the whole class to a slide of the session's stored lesson. */
  async goTo(sessionId: Id, slideIndex: number): Promise<void> {
    this.auth.requireAdmin();
    const lesson = await this.lessonOf(sessionId);
    if (lesson) await this.update(sessionId, () => ({ slideIndex: clampIndex(slideIndex, lesson.slides.length) }));
  }

  /** Publishes the answer of a question of the session's stored lesson and locks it. */
  async reveal(sessionId: Id, slideId: Id): Promise<void> {
    this.auth.requireAdmin();
    const slide = (await this.lessonOf(sessionId))?.slides.find((s) => s.id === slideId);
    if (!slide || !isQuestion(slide)) return;
    const key = answerKey(slide);
    await this.update(sessionId, (session) => ({ reveals: { ...session.reveals, [slideId]: key } }));
  }

  /** Sets how the given groups of the session's roster move through the lesson; any other id is ignored. */
  async setPacing(sessionId: Id, groupIds: readonly Id[], mode: PacingMode): Promise<void> {
    const roster = await this.rosters.rosterOf(sessionId);
    const own = groupIds.filter((groupId) => isOnRoster(roster, { kind: 'group', id: groupId }));
    await this.update(sessionId, (session) => {
      const pacing: Record<Id, GroupPacing> = { ...session.pacing };
      for (const groupId of own) pacing[groupId] = pacingFor(mode, session);
      return { pacing };
    });
  }

  /** Shows a message to all groups (`groupId` null) or to one group of the session's roster. A blank message, or a group that is not the session's, sends nothing. */
  async sendMessage(sessionId: Id, text: string, groupId: Id | null): Promise<void> {
    const cleaned = cleanMessage(text);
    if (cleaned === null || (groupId !== null && !isOnRoster(await this.rosters.rosterOf(sessionId), { kind: 'group', id: groupId }))) return;
    await this.update(sessionId, () => ({ message: { id: newId(), text: cleaned, groupId } }));
  }

  async clearMessage(sessionId: Id): Promise<void> {
    await this.update(sessionId, () => ({ message: null }));
  }

  /** Sets the fewest individual questions a present student should answer; the default is kept as no setting at all, and a value that is not a number changes nothing. */
  async setMinInteractions(sessionId: Id, value: number): Promise<void> {
    this.auth.requireAdmin();
    const lesson = await this.lessonOf(sessionId);
    if (!lesson) return;
    const answers = await this.store.list('answers', { sessionId });
    await this.store.update('sessions', sessionId, (current) => (acceptsChanges(current) ? withMinInteractions(current, lesson, answers, value) : current));
  }

  /** The lesson of the stored session; read before an update, never inside its change function. */
  private async lessonOf(sessionId: Id): Promise<Lesson | null> {
    const session = await this.store.get('sessions', sessionId);
    return session ? this.store.get('lessons', session.lessonId) : null;
  }

  /**
   * Applies a change to the session as stored, in one step, never to a caller's copy:
   * overlapping commands must not undo each other. A class that has ended accepts none.
   */
  private async update(sessionId: Id, change: (current: Session) => Partial<Session>): Promise<void> {
    this.auth.requireAdmin();
    await this.store.update('sessions', sessionId, (current) => (acceptsChanges(current) ? { ...current, ...change(current) } : current));
  }
}
