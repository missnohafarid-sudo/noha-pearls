import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RewardIndex, studentReport } from '../domain/analytics';
import { resultsReport } from '../domain/resultRows';
import { groupById, studentByCard } from '../domain/roster';
import { publishedKeys, scoreboard } from '../domain/scoring';
import { answer, answers, heart, hearts, lesson, live, reveal1, roster } from '../domain/visibility.fixtures';
import type { BoardTotal, CardResults } from '../domain/visibility';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { boardFor, participantsFor, rewardsFor, rostersFor } from './serviceKit';

let store: LocalDocumentStore;
const caller: Caller = { isAdmin: () => false, deviceId: () => 'visitor' };

beforeEach(async () => {
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', live);
  await store.put('lessons', lesson);
  await store.put('rosters', roster);
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

/** What the board page computed itself before the service did. */
function oldTotals(session = live, given = hearts, answered = answers) {
  const index = new RewardIndex(given);
  return scoreboard(lesson, roster, answered, publishedKeys(session)).flatMap((score) => {
    const group = groupById(roster.groups, score.groupId);
    return group ? [{ ...score, group, hearts: index.groupTotal(group, roster.students) }] : [];
  });
}

/** What the page shows of a report. */
function shown(results: CardResults | null) {
  return (
    results && {
      name: results.name,
      group: results.group,
      hearts: results.hearts,
      points: results.report.points,
      rows: results.report.results,
    }
  );
}

function oldResults(cardNumber: number, session = live, given = hearts, answered = answers): CardResults | null {
  const student = studentByCard(roster.students, cardNumber);
  if (!student) return null;
  return {
    name: student.name,
    group: groupById(roster.groups, student.groupId),
    report: resultsReport(studentReport(lesson, session, roster, student, answered)),
    hearts: new RewardIndex(given).of({ kind: 'student', id: student.id }),
  };
}

describe('the totals of the board', () => {
  it('equal what the page computed from the same stored data, across a reveal and a heart', async () => {
    const board = boardFor(store, caller);
    await Promise.all(answers.map((a) => store.put('answers', a)));
    await Promise.all(hearts.map((h) => store.put('rewards', h)));
    const totals = watched<BoardTotal[]>((l) => board.watchTotals(live.code, l));
    await vi.waitFor(() => expect(totals.last()).toEqual(oldTotals()));

    const revealed = { ...live, reveals: reveal1 };
    await store.put('sessions', revealed);
    await vi.waitFor(() => expect(totals.last()).toEqual(oldTotals(revealed)));

    const extra = heart('group', 'g2', 'teacher');
    await store.put('rewards', extra);
    await vi.waitFor(() => expect(totals.last()).toEqual(oldTotals(revealed, [...hearts, extra])));
    totals.stop();
  });

  it('are empty for a class that is not stored', async () => {
    const totals = watched<BoardTotal[]>((l) => boardFor(store, caller).watchTotals('nope', l));
    await vi.waitFor(() => expect(totals.last()).toEqual([]));
    totals.stop();
  });
});

describe('the results behind a card', () => {
  it('equal the student report, her hearts and her group, and follow a reveal and a heart', async () => {
    const board = boardFor(store, caller);
    await Promise.all(answers.map((a) => store.put('answers', a)));
    const results = watched<CardResults | null>((l) => board.watchCardResults(live.code, 1, l));
    await vi.waitFor(() => expect(shown(results.last() ?? null)).toEqual(shown(oldResults(1, live, []))));

    const revealed = { ...live, reveals: reveal1 };
    await store.put('sessions', revealed);
    await vi.waitFor(() => expect(shown(results.last() ?? null)).toEqual(shown(oldResults(1, revealed, []))));

    const given = heart('student', 's1', 'peer');
    await store.put('rewards', given);
    await vi.waitFor(() => expect(shown(results.last() ?? null)).toEqual(shown(oldResults(1, revealed, [given]))));
    results.stop();
  });

  it('are null for a card no student holds', async () => {
    const results = watched<CardResults | null>((l) => boardFor(store, caller).watchCardResults(live.code, 3, l));
    await vi.waitFor(() => expect(results.seen).toHaveLength(1));
    expect(results.last()).toBeNull();
    results.stop();
  });
});

describe('the count of hearts', () => {
  it('follows the hearts given', async () => {
    const caller: Caller = { isAdmin: () => true, deviceId: () => 'd1' };
    const rosters = rostersFor(store, caller);
    const rewards = rewardsFor(store, caller, participantsFor(store, caller, rosters), rosters);
    const count = watched<number>((l) => rewards.watchHeartCount(live.code, l));
    await vi.waitFor(() => expect(count.last()).toBe(0));
    await rewards.giveAsTeacher('x', { kind: 'student', id: 's1' });
    await vi.waitFor(() => expect(count.last()).toBe(1));
    await store.put('answers', answer('q1', 'student', 's1', 1));
    await rewards.giveAsTeacher('x', { kind: 'group', id: 'g2' });
    await vi.waitFor(() => expect(count.last()).toBe(2));
    count.stop();
  });
});
