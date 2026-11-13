import { describe, expect, it } from 'vitest';
import { seatAnswerer } from './admission';
import { RewardIndex, studentReport } from './analytics';
import { deviceAnswer } from './answering';
import type { SessionRoster } from './models';
import { peerRewardTargets } from './rewards';
import { pearlsEarned, publishedKeys, scoreboard } from './scoring';
import { answers, classData, ended, hearts, lesson, live, reveal1, reveal2, roster, seatOf, students } from './visibility.fixtures';
import { boardTotals, cardResults, readerOf, seatView, withoutKey, type ClassData, type SeatRef } from './visibility';

const sara: SeatRef = { groupId: 'g1', studentId: 's1' };
const noor: SeatRef = { groupId: 'g1', studentId: 's2' };
const sharedPearl: SeatRef = { groupId: 'g1', studentId: null };
const revealed1 = classData({ session: { ...live, reveals: reveal1 } });
const revealed2 = classData({ session: { ...live, reveals: reveal2 } });
const keyless = withoutKey(lesson);

describe('board totals', () => {
  it('are empty without a lesson', () => {
    expect(boardTotals(classData({ lesson: null }))).toEqual([]);
  });

  it('score nothing before a reveal and carry each group with its hearts', () => {
    const totals = boardTotals(classData());
    expect(totals.map((t) => [t.groupId, t.score, t.max, t.hearts])).toEqual([['g1', 0, 6, 3], ['g2', 0, 6, 1]]);
    expect(totals[0].group).toBe(roster.groups[0]);
  });

  it('follow the revealed questions: by hand, Pearl averages Sara 2 and Noor 0 to 1, then adds the 3 of the text', () => {
    expect(boardTotals(revealed1).map((t) => [t.score, t.hearts])).toEqual([[1, 3], [0, 1]]);
    expect(boardTotals(revealed2).map((t) => t.score)).toEqual([4, 0]);
  });

  it('equal the scoreboard joined with the group heart totals', () => {
    for (const data of [classData(), revealed1, revealed2]) {
      const scores = scoreboard(lesson, roster, answers, publishedKeys(data.session));
      const index = new RewardIndex(hearts);
      expect(boardTotals(data).map(({ group, hearts: h, ...score }) => ({ ...score, group, h }))).toEqual(
        scores.map((score, i) => ({ ...score, group: roster.groups[i], h: index.groupTotal(roster.groups[i], students) })),
      );
    }
  });
});

describe('results by card', () => {
  it('is none for a card no student holds, and while the class has no lesson', () => {
    expect(cardResults(revealed1, 3)).toBeNull();
    expect(cardResults(classData({ lesson: null }), 1)).toBeNull();
  });

  it('gives the report of the lesson without its key, her group and her hearts', () => {
    const found = cardResults(revealed1, 1);
    expect(found?.name).toBe('Sara');
    expect(found?.group?.id).toBe('g1');
    expect(found?.report).toEqual(studentReport(keyless, revealed1.session, roster, students[0], answers));
    expect(found?.report.points).toBe(2);
    expect(found?.hearts).toEqual(new RewardIndex(hearts).of({ kind: 'student', id: 's1' }));
    expect(found?.hearts.total).toBe(2);
  });

  it('carries no answer key', () => {
    const text = JSON.stringify(cardResults(revealed1, 4));
    expect(text).not.toContain('"correctIndex":1');
    expect(text).not.toContain('since');
    expect(JSON.stringify(cardResults(classData(), 2))).not.toContain('because');
  });
});

/** What the device computes today from the whole class, to be matched by the one value the server sends. */
function today(seat: SeatRef, data: ClassData) {
  const index = new RewardIndex(data.rewards);
  const score = scoreboard(lesson, data.roster, data.answers, publishedKeys(data.session)).find((s) => s.groupId === seat.groupId);
  return {
    pearls: score ? pearlsEarned(score) : 0,
    answers: lesson.slides.flatMap((slide) => {
      if (slide.kind !== 'choice' && slide.kind !== 'text') return [];
      const shown = deviceAnswer(data.roster, data.answers, slide, seat);
      return shown ? [[slide.id, shown] as const] : [];
    }),
    classmates: peerRewardTargets(data.session, seat, data.roster.students).map((s) => [s.id, index.of({ kind: 'student', id: s.id }).total] as const),
  };
}

function expectParity(seat: SeatRef, data: ClassData) {
  const view = seatView(seat, data);
  const expected = today(seat, data);
  expect(view.seat).toBe(seat);
  expect(view.pearls).toBe(expected.pearls);
  expect(Object.entries(view.answers)).toEqual(expected.answers);
  expect(view.classmates.map((c) => [c.id, c.hearts] as const)).toEqual(expected.classmates);
  return view;
}

describe('what a let-in seat is shown', () => {
  it('gives a named seat her own answer, her results, her hearts and her classmates of the other group', () => {
    const view = expectParity(sara, revealed1);
    expect(view.answers.q1).toEqual({ answer: answers[0], coveredByGroup: false });
    expect(view.answers.q2.answer.value).toBe('text');
    expect(view.answers).not.toHaveProperty('q3');
    expect(view.own?.report).toEqual(studentReport(keyless, revealed1.session, roster, students[0], answers));
    expect(view.own?.report?.points).toBe(2);
    expect(view.own?.hearts).toMatchObject({ total: 2, bySource: { teacher: 1, peer: 1 } });
    expect(view.classmates).toEqual([{ id: 's3', name: 'Reem', hearts: 1 }]);
    expect(view.pearls).toBe(1);
  });

  it('counts none of the points before the reveal and 5 pearls when Pearl scores 4 of 6', () => {
    expect(expectParity(sara, classData()).pearls).toBe(0);
    expect(expectParity(sara, revealed2).pearls).toBe(5);
  });

  it('covers a named seat with her group, and says so in her results', () => {
    const view = expectParity(noor, revealed1);
    expect(view.answers.q1).toEqual({ answer: answers[1], coveredByGroup: true });
    expect(view.own?.report?.results[0]).toMatchObject({ byGroup: true, verdict: 'wrong' });
    expect(view.own?.hearts.total).toBe(0);
  });

  it('shows an absent named seat no covering answer, and her group the pearls of the present', () => {
    const absent: SessionRoster = { ...roster, present: ['s1', 's3'] };
    const view = expectParity(noor, classData({ session: revealed1.session, roster: absent }));
    expect(view.answers).not.toHaveProperty('q1');
    expect(view.pearls).toBe(2);
  });

  it('gives a shared device its group answer, no results of her own and no classmates', () => {
    const view = expectParity(sharedPearl, revealed1);
    expect(view.answers.q1).toEqual({ answer: answers[1], coveredByGroup: false });
    expect(view.own).toBeNull();
    expect(view.classmates).toEqual([]);
  });

  it('keeps the results null while the class has no lesson', () => {
    const view = seatView(sara, classData({ lesson: null }));
    expect(view).toMatchObject({ pearls: 0, answers: {}, own: { report: null } });
  });

  it('follows a student moved to another group', () => {
    const movedStudents = students.map((s) => (s.id === 's3' ? { ...s, groupId: 'g1' } : s));
    const data = classData({ session: revealed1.session, roster: { ...roster, students: movedStudents } });
    const reader = readerOf(false, seatOf('p', 'g2', 's3'), movedStudents);
    expect(reader.seat).toEqual(seatAnswerer(seatOf('p', 'g2', 's3'), movedStudents));
    const view = expectParity(reader.seat as SeatRef, data);
    expect(view.pearls).toBe(1);
    expect(view.answers.q1.answer).toBe(answers[2]);
    expect(view.classmates).toEqual([]);
  });

  it('gives no classmates once the class has ended, and keeps everything else', () => {
    const view = expectParity(sara, classData({ session: { ...ended, reveals: reveal1 } }));
    expect(view.classmates).toEqual([]);
    expect(view.own?.report?.points).toBe(2);
    expect(view.pearls).toBe(1);
  });
});
