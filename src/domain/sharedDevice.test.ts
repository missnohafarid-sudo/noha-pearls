import { describe, expect, it } from 'vitest';
import { takesAnswerPerStudent } from './answering';
import { mayAnswerFor, memberViews, sharedDeviceMembers } from './sharedDevice';
import { seatView } from './visibility';
import { answer, answers, classData, live, q1, q2, q3, roster, seatOf } from './visibility.fixtures';

const shared = seatOf('x:shared', 'g1', null);
const named = seatOf('x:sara', 'g1', 's1');
const idsOf = (list: { id: string }[]) => list.map((member) => member.id);

describe('the members a shared group device stands for', () => {
  it('lists the present students of its own group, in card order, all helped when nobody holds a device of her own', () => {
    expect(sharedDeviceMembers(shared, roster, [shared])).toEqual([
      { id: 's1', name: 'Sara', helped: true },
      { id: 's2', name: 'Noor', helped: true },
    ]);
  });

  it('is empty for a named seat', () => {
    expect(sharedDeviceMembers(named, roster, [named])).toEqual([]);
  });

  it('does not list a student marked absent', () => {
    expect(idsOf(sharedDeviceMembers(shared, { ...roster, present: ['s2', 's3'] }, [shared]))).toEqual(['s2']);
  });

  it('follows the group each student is in now', () => {
    const moved = { ...roster, students: roster.students.map((s) => (s.id === 's2' ? { ...s, groupId: 'g2' } : s)) };
    expect(idsOf(sharedDeviceMembers(shared, moved, [shared]))).toEqual(['s1']);
  });

  it('marks a student with an admitted device of her own as not helped, and helps her again once that seat is gone', () => {
    expect(sharedDeviceMembers(shared, roster, [shared, named])).toEqual([
      { id: 's1', name: 'Sara', helped: false },
      { id: 's2', name: 'Noor', helped: true },
    ]);
    expect(sharedDeviceMembers(shared, roster, [shared]).every((member) => member.helped)).toBe(true);
  });

  it('is not blocked by her seat while it still waits to be let in', () => {
    expect(sharedDeviceMembers(shared, roster, [shared, { ...named, admitted: false }]).every((member) => member.helped)).toBe(true);
  });
});

describe('answering for a member from a shared device', () => {
  it('is allowed for a helped member only', () => {
    const seats = [shared, named];
    expect(mayAnswerFor(shared, 's2', roster, seats)).toBe(true);
    expect(mayAnswerFor(shared, 's1', roster, seats)).toBe(false);
    expect(mayAnswerFor(shared, 's3', roster, seats)).toBe(false);
    expect(mayAnswerFor(shared, 'nobody', roster, seats)).toBe(false);
    expect(mayAnswerFor(named, 's2', roster, seats)).toBe(false);
    expect(mayAnswerFor(shared, 's2', { ...roster, present: ['s1'] }, seats)).toBe(false);
  });

  it('applies to open individual choice questions only', () => {
    expect(takesAnswerPerStudent(live, q1)).toBe(true);
    expect(takesAnswerPerStudent(live, q3)).toBe(false);
    expect(takesAnswerPerStudent(live, q2)).toBe(false);
    expect(takesAnswerPerStudent({ ...live, reveals: { q1: { correctIndex: 1, explanation: '' } } }, q1)).toBe(false);
  });
});

describe('what a shared device sees of its members', () => {
  const questions = [q1, q2, q3];

  it('shows each helped member the answer that counts for her, her own or the group\'s', () => {
    const own = [...answers, answer('q1', 'student', 's2', 2)];
    expect(memberViews(shared, roster, [shared], own, questions).map(({ id, answers: shown }) => [id, shown])).toEqual([
      ['s1', { q1: { value: 1, from: 'own' } }],
      ['s2', { q1: { value: 2, from: 'own' } }],
    ]);
    expect(memberViews(shared, roster, [shared], answers, questions)[1]?.answers).toEqual({ q1: { value: 0, from: 'group' } });
  });

  it('shows no answer of a member on a device of her own, and none for group or written questions', () => {
    const views = memberViews(shared, roster, [shared, named], answers, questions);
    expect(views[0]).toEqual({ id: 's1', name: 'Sara', helped: false, answers: {} });
    expect(Object.keys(views[1]?.answers ?? {})).toEqual(['q1']);
  });

  it('is carried by the seat view for a shared device and is empty for a named seat', () => {
    const data = classData({ participants: [shared, named] });
    expect(seatView(shared, data).members.map(({ id, helped }) => [id, helped])).toEqual([['s1', false], ['s2', true]]);
    expect(seatView(named, data).members).toEqual([]);
    expect(seatView(shared, classData({ participants: [shared], lesson: null })).members.map(({ answers: shown }) => shown)).toEqual([{}, {}]);
  });
});
