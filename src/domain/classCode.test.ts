import { describe, expect, it } from 'vitest';
import { canGiveAnotherPeerHeart } from './rewards';
import { canWaitForSeat, seatId } from './admission';
import { deviceAnswerStep } from './answerChanges';
import { codeOpens, lookupIsExempt } from './classCode';
import type { Answer, Participant } from './models';
import { ended, live } from './visibility.fixtures';

const visitor = { isAdmin: false, holdsSeat: false };

describe('what a class code opens', () => {
  it('opens a running class for anyone', () => {
    expect(codeOpens(live, visitor)).toBe(true);
  });

  it('opens an ended class only for the admin and for a device that holds a seat in it', () => {
    expect(codeOpens(ended, visitor)).toBe(false);
    expect(codeOpens(ended, { isAdmin: false, holdsSeat: true })).toBe(true);
    expect(codeOpens(ended, { isAdmin: true, holdsSeat: false })).toBe(true);
  });

  it('opens nothing for a code that names no class, whoever asks', () => {
    for (const who of [visitor, { isAdmin: true, holdsSeat: false }, { isAdmin: false, holdsSeat: true }]) expect(codeOpens(null, who)).toBe(false);
  });

  it('checks the lookups of everyone but the admin and a device with a seat in the class', () => {
    expect(lookupIsExempt(live, visitor)).toBe(false);
    expect(lookupIsExempt(null, { isAdmin: false, holdsSeat: true })).toBe(false);
    expect(lookupIsExempt(ended, { isAdmin: false, holdsSeat: true })).toBe(true);
    expect(lookupIsExempt(null, { isAdmin: true, holdsSeat: false })).toBe(true);
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

