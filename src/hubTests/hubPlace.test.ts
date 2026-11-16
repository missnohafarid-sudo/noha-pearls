import { describe, expect, it } from 'vitest';
import { coloOf, TracedPlace } from '../server/TracedPlace';

const TRACE = 'fl=1f\nh=www.cloudflare.com\nip=203.0.113.9\nts=1763300000.1\nvisit_scheme=https\ncolo=FRA\nhttp=http/1.1\nloc=DE\n';

function memoryKv() {
  const kept = new Map<string, unknown>();
  return { get: <T>(key: string) => kept.get(key) as T | undefined, put: <T>(key: string, value: T) => void kept.set(key, value) };
}

describe('where the hub runs', () => {
  it('reads the data centre from a trace, and nothing from a page without one', () => {
    expect(coloOf(TRACE)).toBe('FRA');
    expect(coloOf('<html>error</html>')).toBeNull();
  });

  it('asks once and keeps the answer, also for a hub built again on the same storage', async () => {
    const kv = memoryKv();
    let asked = 0;
    const fetchText = async () => (asked += 1, TRACE);
    expect(await new TracedPlace(kv, fetchText).code()).toBe('FRA');
    expect(await new TracedPlace(kv, fetchText).code()).toBe('FRA');
    expect(asked).toBe(1);
  });

  it('says nothing when the ask fails, and asks again next time', async () => {
    const answers = [Promise.reject(new Error('offline')), Promise.resolve(TRACE)];
    const place = new TracedPlace(memoryKv(), () => answers.shift() ?? Promise.resolve(''));
    expect(await place.code()).toBeNull();
    expect(await place.code()).toBe('FRA');
  });
});
