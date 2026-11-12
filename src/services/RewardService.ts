import { newId } from '../domain/ids';
import type { Id, Reward, RewardSource, SubjectRef } from '../domain/models';
import { canGivePeerHeart, canGiveTeacherHeart } from '../domain/rewards';
import { studentById } from '../domain/roster';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { AuthService } from './AuthService';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** Hearts on the reinforcement board. */
export class RewardService {
  constructor(
    private readonly store: DocumentStore,
    private readonly auth: AuthService,
    private readonly seats: SeatSource,
    private readonly rosters: SessionRosterSource,
  ) {}

  watchRewards(sessionId: Id, listener: (rewards: Reward[]) => void): Unsubscribe {
    return this.store.watch('rewards', { sessionId }, listener);
  }

  /** Admin only: a heart in the teacher's name, for a student or a group of the session's roster. Returns false when the target is not on it. Accepted after the class has ended too. */
  async giveAsTeacher(sessionId: Id, target: SubjectRef): Promise<boolean> {
    this.auth.requireAdmin();
    const [session, roster] = await Promise.all([this.store.get('sessions', sessionId), this.rosters.rosterOf(sessionId)]);
    if (!canGiveTeacherHeart(session, roster, target)) return false;
    await this.add(sessionId, target, 'teacher');
    return true;
  }

  /** A heart from this admitted device to a classmate on the session's roster, judged on the stored seat and the groups they are in now. Returns false when the rules do not allow it. */
  async giveAsPeer(sessionId: Id, classmateId: Id): Promise<boolean> {
    const seat = await this.seats.admittedSeat(sessionId);
    const [session, { students }] = await Promise.all([this.store.get('sessions', sessionId), this.rosters.rosterOf(sessionId)]);
    const classmate = studentById(students, classmateId);
    if (!seat || !session || !classmate || !canGivePeerHeart(session, seat, classmate, students)) return false;
    await this.add(sessionId, { kind: 'student', id: classmate.id }, 'peer');
    return true;
  }

  private add(sessionId: Id, target: SubjectRef, source: RewardSource): Promise<void> {
    return this.store.put('rewards', { id: newId(), sessionId, target, source, at: Date.now() });
  }
}
