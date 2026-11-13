import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../domain/models';
import { live, reveal1, roster, seatOf } from '../domain/visibility.fixtures';
import { LocalChangeBus, LocalDocumentStore } from '../infrastructure/LocalDocumentStore';
import { MemoryStorage } from '../infrastructure/storage';
import type { Caller } from '../ports/caller';
import { createDataServices } from './createDataServices';

let store: LocalDocumentStore;
let admin = false;
const caller: Caller = { isAdmin: () => admin, deviceId: () => 'd1' };
const seatId = 'x:d1';

const toGroup1 = { id: 'm1', text: 'for Pearl', groupId: 'g1' };
const toAll = { id: 'm2', text: 'for everyone', groupId: null };
const revealed: Session = { ...live, reveals: reveal1, message: toGroup1 };

beforeEach(async () => {
  admin = false;
  store = new LocalDocumentStore(new MemoryStorage(), new LocalChangeBus(), 'test');
  await store.put('sessions', revealed);
  await store.put('rosters', roster);
});

function watched<T>(start: (listener: (value: T) => void) => () => void) {
  const seen: T[] = [];
  const stop = start((value) => seen.push(value));
  return { seen, stop, last: () => seen.at(-1) };
}

const byCode = (code = revealed.code) => watched<Session | null>((l) => createDataServices(store, caller).classLookup.watchByCode(code, l));

describe('the class a code names', () => {
  it('is whole for the admin', async () => {
    admin = true;
    const reading = byCode();
    await vi.waitFor(() => expect(reading.last()).toEqual(revealed));
    reading.stop();
  });

  it('shows a let-in seat the reveals and only her own group\'s message', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const reading = byCode();
    await vi.waitFor(() => expect(reading.last()).toEqual(revealed));
    await store.put('sessions', { ...revealed, message: { ...toGroup1, groupId: 'g2' } });
    await vi.waitFor(() => expect(reading.last()?.message).toBeNull());
    expect(reading.last()?.reveals).toEqual(reveal1);
    await store.put('sessions', { ...revealed, message: toAll });
    await vi.waitFor(() => expect(reading.last()?.message).toEqual(toAll));
    reading.stop();
  });

  it('shows a visitor, a waiting device and a removed device no reveals and no message', async () => {
    const visitor = byCode();
    await vi.waitFor(() => expect(visitor.last()).toEqual({ ...revealed, reveals: {}, message: null }));
    await store.put('participants', seatOf(seatId, 'g1', 's1', false));
    const waiting = byCode();
    await vi.waitFor(() => expect(waiting.last()).toEqual({ ...revealed, reveals: {}, message: null }));
    expect(JSON.stringify([visitor.seen, waiting.seen])).not.toContain('because');
    expect(JSON.stringify([visitor.seen, waiting.seen])).not.toContain('for Pearl');
    visitor.stop();
    waiting.stop();
  });

  it('starts showing reveals when her seat is let in, and stops when it is removed', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1', false));
    const reading = byCode();
    await vi.waitFor(() => expect(reading.last()?.reveals).toEqual({}));
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    await vi.waitFor(() => expect(reading.last()).toEqual(revealed));
    await store.remove('participants', seatId);
    await vi.waitFor(() => expect(reading.last()).toEqual({ ...revealed, reveals: {}, message: null }));
    reading.stop();
  });

  it('follows a reveal of the teacher for a seat that is in', async () => {
    await store.put('participants', seatOf(seatId, 'g1', 's1'));
    const reading = byCode();
    await vi.waitFor(() => expect(reading.last()?.slideIndex).toBe(revealed.slideIndex));
    await store.put('sessions', { ...revealed, slideIndex: 3 });
    await vi.waitFor(() => expect(reading.last()?.slideIndex).toBe(3));
    reading.stop();
  });

  it('is null for a code no class has, for anyone', async () => {
    const reading = byCode('NOPE22');
    await vi.waitFor(() => expect(reading.seen).toEqual([null]));
    reading.stop();
  });
});
