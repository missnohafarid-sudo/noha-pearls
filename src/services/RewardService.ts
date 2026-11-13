import { newId } from '../domain/ids';
import type { Id, Reward, RewardSource, SubjectRef } from '../domain/models';
import { canGiveAnotherPeerHeart, canGivePeerHeart, canGiveTeacherHeart } from '../domain/rewards';
import { studentById } from '../domain/roster';
import { PEER_HEARTS_PER_GIVER } from '../ports/limits';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { adminWatch, requireAdmin } from './AuthService';
import { watchByCode } from './classData';
import type { ClassResolver } from './ClassResolver';
import { requireWithin } from './LimitError';
import type { SeatSource } from './SeatSource';
import type { SessionRosterSource } from './SessionRosterSource';

/** Hearts on the reinforcement board. */
export class RewardService {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
    private readonly seats: SeatSource,
    private readonly rosters: SessionRosterSource,
    private readonly codes: ClassResolver,
  ) {}

  watchRewards(sessionId: Id, listener: (rewards: Reward[]) => void): Unsubscribe {
    return adminWatch(this.caller, listener, (emit) => this.store.watch('rewards', { sessionId }, emit));
  }

  /** How many hearts the class this code opens has been given, and nothing about whom. */
  watchHeartCount(code: string, listener: (count: number) => void): Unsubscribe {
    return watchByCode<number>(this.codes, code, (session) => (emit) => this.store.watch('rewards', { sessionId: session.id }, (rewards) => emit(rewards.length)), 0, listener);
  }

  /** Admin only: a heart in the teacher's name, for a student or a group of the session's roster. Returns false when the target is not on it. Accepted after the class has ended too. */
  async giveAsTeacher(sessionId: Id, target: SubjectRef): Promise<boolean> {
    requireAdmin(this.caller);
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
    const given = await this.store.list('rewards', { sessionId, giverId: seat.id });
    requireWithin(canGiveAnotherPeerHeart(given, PEER_HEARTS_PER_GIVER), 'hearts-used');
    await this.add(sessionId, { kind: 'student', id: classmate.id }, 'peer', seat.id);
    return true;
  }

  private add(sessionId: Id, target: SubjectRef, source: RewardSource, giverId?: Id): Promise<void> {
    return this.store.put('rewards', { id: `${sessionId}:${newId()}`, sessionId, target, source, at: Date.now(), ...(giverId && { giverId }) });
  }
}
