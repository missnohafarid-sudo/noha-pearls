import { addToRoll, joinRoll, markAbsent } from '../domain/attendance';
import type { ClassRoster, Id, SessionRoster, Student } from '../domain/models';
import { addStudentToRoster, isOnRoster, moveStudent, renameGroupIn } from '../domain/roster';
import { acceptsChanges } from '../domain/sessions';
import { seenRoster, type SeenRoster } from '../domain/visibility';
import type { DocumentStore, Unsubscribe } from '../ports/store';
import type { Caller } from '../ports/caller';
import { requireAdmin } from './AuthService';
import type { PresenceMarker } from './PresenceMarker';
import { NO_ROSTER, type SessionRosterSource } from './SessionRosterSource';

/** The roster with the new lists and everything else (its id, its roll) as it was; null when the rule refused. */
function merged(roster: SessionRoster, lists: ClassRoster | null): SessionRoster | null {
  return lists && { ...roster, ...lists };
}

/**
 * The groups and students of one session, as its own copy of the class's. The teacher regroups for today here;
 * the class list is not touched, and the lasting list is changed on the students page.
 */
export class SessionRosterService implements SessionRosterSource, PresenceMarker {
  constructor(
    private readonly store: DocumentStore,
    private readonly caller: Caller,
  ) {}

  watchRoster(sessionId: Id, listener: (roster: SessionRoster) => void): Unsubscribe {
    return this.watchRosterOf(sessionId, listener);
  }

  /** The groups and students without the roll or card numbers: all a device needs to pick its group and name. Open to anyone. */
  watchSeen(sessionId: Id, listener: (roster: SeenRoster) => void): Unsubscribe {
    return this.watchRosterOf(sessionId, (roster) => listener(seenRoster(roster)));
  }

  watchRosterOf(sessionId: Id, listener: (roster: SessionRoster) => void): Unsubscribe {
    return this.store.watch('rosters', { id: sessionId }, (docs) => listener(docs[0] ?? NO_ROSTER));
  }

  async rosterOf(sessionId: Id): Promise<SessionRoster> {
    return (await this.store.get('rosters', sessionId)) ?? NO_ROSTER;
  }

  /** Admin only: puts the student in another group of the session. Returns false when the rules do not allow it. */
  moveStudent(sessionId: Id, studentId: Id, groupId: Id): Promise<boolean> {
    return this.change(sessionId, (roster) => merged(roster, moveStudent(roster, studentId, groupId)));
  }

  /** Admin only: adds a student who is not on the list, with the lowest free card number of the session. Null when the rules do not allow it. */
  async addStudent(sessionId: Id, name: string, groupId: Id): Promise<Student | null> {
    let added: Student | null = null;
    await this.change(sessionId, (roster) => {
      const result = addStudentToRoster(roster, name, groupId);
      if (!result) return null;
      added = result.student;
      return addToRoll({ ...roster, ...result.roster }, [result.student.id]);
    });
    return added;
  }

  /** Admin only: renames a group of the session. Returns false when the rules do not allow it. */
  renameGroup(sessionId: Id, groupId: Id, name: string): Promise<boolean> {
    return this.change(sessionId, (roster) => merged(roster, renameGroupIn(roster, groupId, name)));
  }

  async joinRoll(sessionId: Id, studentIds: readonly Id[]): Promise<void> {
    await this.change(sessionId, (roster) => joinRoll(roster, studentIds));
  }

  async addToRoll(sessionId: Id, studentIds: readonly Id[]): Promise<void> {
    await this.change(sessionId, (roster) => addToRoll(roster, studentIds));
  }

  /** Admin only: the teacher marks a student present by hand. Does nothing when no roll was taken, as she already counts. Returns false when she is not on the roster or the class has ended. */
  markPresent(sessionId: Id, studentId: Id): Promise<boolean> {
    return this.change(sessionId, (roster) => (isOnRoster(roster, { kind: 'student', id: studentId }) ? addToRoll(roster, [studentId]) : null));
  }

  /** Admin only: the teacher marks a student absent by hand, starting a roll from everyone when none was taken. Returns false when she is not on the roster or the class has ended. */
  markAbsent(sessionId: Id, studentId: Id): Promise<boolean> {
    return this.change(sessionId, (roster) => markAbsent(roster, studentId));
  }

  /** Applies a rule to the roster as stored, in one step, for a running class only. A rule that refuses leaves it as it was. */
  private async change(sessionId: Id, rule: (roster: SessionRoster) => SessionRoster | null): Promise<boolean> {
    requireAdmin(this.caller);
    if (!acceptsChanges(await this.store.get('sessions', sessionId))) return false;
    let applied = false;
    await this.store.update('rosters', sessionId, (current) => {
      const next = rule(current);
      if (!next) return current;
      applied = true;
      return next;
    });
    return applied;
  }
}
