import { describe, expect, it } from 'vitest';
import { canGiveAnotherPeerHeart } from './rewards';
import { canWaitForSeat, holdsSeat, joinChangesNothing, seatId } from './admission';
import { deviceAnswerStep } from './answerChanges';
import { codeOpens, lookupIsExempt } from './classCode';
import type { Answer, Participant } from './models';
import { ended, live } from './visibility.fixtures';

const seatOf = (admitted: boolean): Participant => ({ id: 'x:d', sessionId: 'x', groupId: 'g', studentId: null, joinedAt: 1, admitted });
const visitor = { isAdmin: false, seat: null };
const letIn = { isAdmin: false, seat: seatOf(true) };
const waiting = { isAdmin: false, seat: seatOf(false) };
const admin = { isAdmin: true, seat: null };

describe('what a class code opens', () => {
  it('opens a running class for anyone', () => {
    expect(codeOpens(live, visitor)).toBe(true);
  });

  it('opens an ended class only for the admin and for a device that was let in to it; a seat still waiting is a stranger’s', () => {
    expect(codeOpens(ended, visitor)).toBe(false);
    expect(codeOpens(ended, waiting)).toBe(false);
    expect(codeOpens(ended, letIn)).toBe(true);
    expect(codeOpens(ended, admin)).toBe(true);
  });

  it('opens nothing for a code that names no class, whoever asks', () => {
    for (const who of [visitor, admin, letIn, waiting]) expect(codeOpens(null, who)).toBe(false);
  });

  it('checks the lookups of everyone but the admin and a device that was let in to the class; a waiting seat is checked like a stranger', () => {
    expect(lookupIsExempt(live, visitor)).toBe(false);
    expect(lookupIsExempt(ended, waiting)).toBe(false);
    expect(lookupIsExempt(null, letIn)).toBe(false);
    expect(lookupIsExempt(ended, letIn)).toBe(true);
    expect(lookupIsExempt(null, admin)).toBe(true);
  });
});

const seat = (id: string, studentId: string | null, admitted = false): Participant => ({ id, sessionId: 's', groupId: 'g', studentId, joinedAt: 1, admitted });
const caps = { perStudent: 2, sharedPerClass: 10 };

describe('crowding a class with waiting seats', () => {
  it('names a seat by session and device', () => {
    expect(seatId('s', 'd')).toBe('s:d');
  });

  it('allows two other devices waiting under one name, not a third; admitted seats and the device\'s own do not count', () => {
    const waiting = [seat('s:a', 'x'), seat('s:b', 'x'), seat('s:c', 'x', true)];
    expect(canWaitForSeat(waiting, 's:me', 'x', caps)).toBe(false);
    expect(canWaitForSeat(waiting, 's:a', 'x', caps)).toBe(true);
    expect(canWaitForSeat(waiting, 's:me', 'y', caps)).toBe(true);
  });

  it('counts a seat as held only once the teacher let it in', () => {
    expect(holdsSeat(null)).toBe(false);
    expect(holdsSeat(seat('s:a', 'x'))).toBe(false);
    expect(holdsSeat(seat('s:a', 'x', true))).toBe(true);
  });

  it('knows that asking again for the same group and name changes nothing, waiting or let in, and that another name or group does', () => {
    expect(joinChangesNothing(null, 'g', 'x')).toBe(false);
    expect(joinChangesNothing(seat('s:a', 'x'), 'g', 'x')).toBe(true);
    expect(joinChangesNothing(seat('s:a', 'x', true), 'g', 'x')).toBe(true);
    expect(joinChangesNothing(seat('s:a', 'x'), 'g', 'y')).toBe(false);
    expect(joinChangesNothing(seat('s:a', 'x'), 'h', 'x')).toBe(false);
    expect(joinChangesNothing(seat('s:a', null), 'g', null)).toBe(true);
    expect(joinChangesNothing(seat('s:a', null), 'g', 'x')).toBe(false);
  });

  it('allows ten shared devices waiting in a class', () => {
    const shared = Array.from({ length: 10 }, (_, i) => seat(`s:${i}`, null));
    expect(canWaitForSeat(shared, 's:me', null, caps)).toBe(false);
    expect(canWaitForSeat(shared.slice(1), 's:me', null, caps)).toBe(true);
  });
});

describe('hearts between students', () => {
  it('stop at the limit, and the teacher\'s hearts are not counted', () => {
    const peer = Array.from({ length: 10 }, () => ({ source: 'peer' as const }));
    expect(canGiveAnotherPeerHeart(peer.slice(1), 10)).toBe(true);
    expect(canGiveAnotherPeerHeart(peer, 10)).toBe(false);
    expect(canGiveAnotherPeerHeart([...peer.slice(1), { source: 'teacher' }], 10)).toBe(true);
  });
});

const stored = (value: number, changes?: number): Answer => ({ id: 'a', sessionId: 's', slideId: 'q', subject: { kind: 'student', id: 'x' }, value, source: 'device', at: 1, ...(changes !== undefined && { changes }) });

describe('changing a device\'s answer', () => {
  it('writes the first answer, ignores the same answer again, counts each change and refuses the 31st', () => {
    expect(deviceAnswerStep(null, 1, 30)).toEqual({ kind: 'write', changes: undefined });
    expect(deviceAnswerStep(stored(1), 1, 30)).toEqual({ kind: 'same' });
    expect(deviceAnswerStep(stored(1), 2, 30)).toEqual({ kind: 'write', changes: 1 });
    expect(deviceAnswerStep(stored(1, 29), 2, 30)).toEqual({ kind: 'write', changes: 30 });
    expect(deviceAnswerStep(stored(1, 30), 2, 30)).toEqual({ kind: 'refused' });
    expect(deviceAnswerStep(stored(1, 30), 1, 30)).toEqual({ kind: 'same' });
  });
});

