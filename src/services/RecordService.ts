import type { Id } from '../domain/models';
import { periodAt, type Period, type PeriodKind } from '../domain/periods';
import { classRecord } from '../domain/records';
import { isLive } from '../domain/sessions';
import { ownStanding, recordsIn, standings, type GroupStanding, type OwnStanding, type Standings } from '../domain/standings';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { AuthService } from './AuthService';
import type { ClassRosterSource } from './ClassRosterSource';
import type { RecordKeeper } from './RecordKeeper';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** What ended classes came to, kept once so that later edits to a lesson or a list cannot change it, and summed over a period. */
export class RecordService implements RecordKeeper {
  constructor(
    private readonly store: DocumentStore,
    private readonly auth: AuthService,
    private readonly rosters: SessionRosterSource,
    private readonly classes: ClassRosterSource,
    private readonly seats: SeatSource,
  ) {}

  async keep(sessionId: Id): Promise<void> {
    this.auth.requireAdmin();
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
    this.auth.requireAdmin();
    return this.sum(classId, period);
  }

  /** Anyone: only the groups' cumulative results of one class list; no student row leaves here. */
  async groupStandingsOf(classId: Id, period: Period): Promise<GroupStanding[]> {
    return (await this.sum(classId, period)).groups;
  }

  /** Anyone: the cumulative results of the student this device was let in as, in the class list of that session; none for any other device. */
  async ownStandingIn(sessionId: Id, period: Period): Promise<OwnStanding | null> {
    const [seat, session] = await Promise.all([this.seats.admittedSeat(sessionId), this.store.get('sessions', sessionId)]);
    if (!seat || seat.studentId === null || !session) return null;
    return ownStanding(await this.sum(session.classId, period), seat.studentId);
  }

  /** Tells how many classes of this class list have been kept, now and whenever one more is, so a page can ask for the sums again. */
  watchKeptCount(classId: Id, listener: (count: number) => void): Unsubscribe {
    return this.store.watch('records', { classId }, (kept) => listener(kept.length));
  }

  private async sum(classId: Id, period: Period): Promise<Standings> {
    const records = recordsIn(await this.store.list('records', { classId }), period);
    const [rewards, roster] = await Promise.all([
      Promise.all(records.map(({ id: sessionId }) => this.store.list('rewards', { sessionId }))).then((given) => given.flat()),
      this.classes.rosterOfClass(classId),
    ]);
    return standings(records, rewards, period, roster);
  }
}
