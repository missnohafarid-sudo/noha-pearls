import type { Id } from '../domain/models';
import { periodAt, type Period, type PeriodKind } from '../domain/periods';
import { classRecord } from '../domain/records';
import { isLive } from '../domain/sessions';
import { ownStanding, recordsIn, standings, type GroupStanding, type OwnStanding, type Standings } from '../domain/standings';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { adminWatch, requireAdmin } from './AuthService';
import { watchByCode } from './classData';
import type { ClassResolver } from './ClassResolver';
import type { ComputedOnce } from './ComputedOnce';
import type { ClassRosterSource } from './ClassRosterSource';
import type { RecordKeeper } from './RecordKeeper';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** What ended classes came to, kept once so that later edits to a lesson or a list cannot change it, and summed over a period. */
export class RecordService implements RecordKeeper {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly rosters: SessionRosterSource,
    private readonly classes: ClassRosterSource,
    private readonly seats: SeatSource,
    private readonly codes: ClassResolver,
    private readonly cache: ComputedOnce,
  ) {}

  async keep(sessionId: Id): Promise<void> {
    requireAdmin(this.caller);
    const [session, kept] = await Promise.all([this.store.get('sessions', sessionId), this.store.get('records', sessionId)]);
    if (!session || isLive(session) || kept) return;
    const lesson = await this.store.get('lessons', session.lessonId);
    if (!lesson) return;
    const [roster, answers] = await Promise.all([this.rosters.rosterOf(sessionId), this.store.list('answers', { sessionId })]);
    await this.store.put('records', classRecord(session, lesson, roster, answers));
  }

  /** The week or month that holds this moment, on the school's clock. */
  currentPeriod(kind: PeriodKind): Period {
    return periodAt(kind, Date.now());
  }

  /** Admin only: the cumulative results of one class list over a period, named as the list names them now; hearts are counted as they stand now. */
  async standingsOf(classId: Id, period: Period): Promise<Standings> {
    requireAdmin(this.caller);
    return this.compute(classId, period);
  }

  /** Anyone with the class's code: only the groups' cumulative results of that class's class list, for this week or this month by the hub's clock; no student row leaves here. */
  async groupStandingsOf(code: string, kind: PeriodKind): Promise<GroupStanding[]> {
    const session = await this.codes.sessionOf(code);
    return session ? (await this.sum(session.classId, this.currentPeriod(kind))).groups : [];
  }

  /** Anyone: the cumulative results of the student this device was let in as, in the class list of that session, for this week or this month by the hub's clock; none for any other device. */
  async ownStandingIn(sessionId: Id, kind: PeriodKind): Promise<OwnStanding | null> {
    const [seat, session] = await Promise.all([this.seats.admittedSeat(sessionId), this.store.get('sessions', sessionId)]);
    if (!seat || seat.studentId === null || !session) return null;
    return ownStanding(await this.sum(session.classId, this.currentPeriod(kind)), seat.studentId);
  }

  /** Tells how many classes of the class list of the class this code opens have been kept, now and whenever one more is, so a page can ask for the sums again. */
  watchKeptCount(code: string, listener: (count: number) => void): Unsubscribe {
    return watchByCode<number>(this.codes, code, (session) => (emit) => this.store.watch('records', { classId: session.classId }, (kept) => emit(kept.length)), 0, listener);
  }

  /** Admin only: the same count for a class list, for the page that sums it. */
  watchClassKeptCount(classId: Id, listener: (count: number) => void): Unsubscribe {
    return adminWatch(this.caller, listener, (emit) => this.store.watch('records', { classId }, (kept) => emit(kept.length)));
  }

  private sum(classId: Id, period: Period): Promise<Standings> {
    return this.cache.get(`${classId}|${period.kind}|${period.start}`, () => this.compute(classId, period));
  }

  private async compute(classId: Id, period: Period): Promise<Standings> {
    const records = recordsIn(await this.store.list('records', { classId }), period);
    const [rewards, roster] = await Promise.all([
      Promise.all(records.map(({ id: sessionId }) => this.store.list('rewards', { sessionId }))).then((given) => given.flat()),
      this.classes.rosterOfClass(classId),
    ]);
    return standings(records, rewards, period, roster);
  }
}
