import { RewardIndex } from './analytics';
import type { ClassRecord, ClassRoster, Id, Reward } from './models';
import { inPeriod, type Period } from './periods';
import { groupById, studentById } from './roster';
import { roundToTenth } from './scoring';

/** The single home for the cumulative results of one class list over a period, summed from its kept records and the hearts given. */

export interface StudentStanding {
  studentId: Id;
  name: string;
  classes: number;
  attended: number;
  answered: number;
  points: number;
  hearts: number;
  unresponsive: number;
}

export interface GroupStanding {
  groupId: Id;
  name: string;
  score: number;
  max: number;
  hearts: number;
}

/** What one student's own device may show of her cumulative results: nothing of her unresponsive count. */
export interface OwnStanding {
  classes: number;
  attended: number;
  points: number;
  hearts: number;
}

export interface Standings {
  classes: number;
  students: StudentStanding[];
  groups: GroupStanding[];
}

/** Highest value first, equal values by name. */
function ranked<T extends { name: string }>(items: Iterable<T>, value: (item: T) => number): T[] {
  return [...items].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, 'ar'));
}

function heartsBySession(rewards: readonly Reward[]): Map<Id, RewardIndex> {
  const bySession = new Map<Id, Reward[]>();
  for (const reward of rewards) bySession.set(reward.sessionId, [...(bySession.get(reward.sessionId) ?? []), reward]);
  return new Map([...bySession].map(([sessionId, given]) => [sessionId, new RewardIndex(given)]));
}

/** The records that fall in the period, oldest first. */
export function recordsIn(records: readonly ClassRecord[], period: Period): ClassRecord[] {
  return records.filter((record) => inPeriod(period, record.startedAt)).sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * The results belong to a class list: a group or student still on it shows the name the list has now; one no longer
 * there (removed, or added for one day only) keeps the name of the newest record.
 */
export function standings(records: readonly ClassRecord[], rewards: readonly Reward[], period: Period, roster: ClassRoster): Standings {
  const inside = recordsIn(records, period);
  const hearts = heartsBySession(rewards);
  const students = new Map<Id, StudentStanding>();
  const groups = new Map<Id, GroupStanding>();

  for (const record of inside) {
    const index = hearts.get(record.id) ?? new RewardIndex([]);
    for (const entry of record.students) {
      const total = students.get(entry.studentId) ?? { studentId: entry.studentId, name: entry.name, classes: 0, attended: 0, answered: 0, points: 0, hearts: 0, unresponsive: 0 };
      students.set(entry.studentId, {
        ...total,
        name: studentById(roster.students, entry.studentId)?.name ?? entry.name,
        classes: total.classes + 1,
        attended: total.attended + (entry.present ? 1 : 0),
        answered: total.answered + entry.answered,
        points: total.points + entry.points,
        hearts: total.hearts + index.of({ kind: 'student', id: entry.studentId }).total,
        unresponsive: total.unresponsive + (entry.unresponsive ? 1 : 0),
      });
    }
    const members = record.students.map(({ studentId, groupId }) => ({ id: studentId, groupId }));
    for (const entry of record.groups) {
      const total = groups.get(entry.groupId) ?? { groupId: entry.groupId, name: entry.name, score: 0, max: 0, hearts: 0 };
      groups.set(entry.groupId, {
        ...total,
        name: groupById(roster.groups, entry.groupId)?.name ?? entry.name,
        score: roundToTenth(total.score + entry.score),
        max: total.max + entry.max,
        hearts: total.hearts + index.groupTotal({ id: entry.groupId }, members),
      });
    }
  }

  return { classes: inside.length, students: ranked(students.values(), (s) => s.points), groups: ranked(groups.values(), (g) => g.score) };
}

/** One student's own line out of the results, over the classes of the period that listed her; all zeros when none did. */
export function ownStanding(all: Standings, studentId: Id): OwnStanding {
  const row = all.students.find((student) => student.studentId === studentId);
  return { classes: row?.classes ?? 0, attended: row?.attended ?? 0, points: row?.points ?? 0, hearts: row?.hearts ?? 0 };
}
