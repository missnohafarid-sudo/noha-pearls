import { describe, expect, it } from 'vitest';
import { coloOf, TracedPlace } from '../server/TracedPlace';
import { memoryKv } from './memoryKv';

const trace = (colo: string) => `fl=1f\nh=www.cloudflare.com\nip=203.0.113.9\nts=1763300000.1\nvisit_scheme=https\ncolo=${colo}\nhttp=http/1.1\nloc=DE\n`;

describe('where the hub runs', () => {
  it('reads the data centre from a trace, and nothing from a page without one', () => {
    expect(coloOf(trace('FRA'))).toBe('FRA');
    expect(coloOf('<html>error</html>')).toBeNull();
  });

  it('answers at once, without asking: nothing before the first answer, then that answer, also for a hub built again', async () => {
    const kv = memoryKv();
    let asked = 0;
    const place = new TracedPlace(kv, async () => (asked += 1, trace('FRA')));
    expect(await place.code()).toBeNull();
    expect(asked).toBe(0);

    await place.refresh();
    expect(await place.code()).toBe('FRA');
    expect(await new TracedPlace(kv, async () => trace('AMS')).code()).toBe('FRA');
  });

  it('keeps the place known before when an ask fails, and takes a new one when Cloudflare names another', async () => {
    const kv = memoryKv();
    await new TracedPlace(kv, async () => trace('FRA')).refresh();
    await new TracedPlace(kv, () => Promise.reject(new Error('offline'))).refresh();
    await new TracedPlace(kv, async () => '<html>challenge</html>').refresh();
    expect(await new TracedPlace(kv).code()).toBe('FRA');

    await new TracedPlace(kv, async () => trace('AMS')).refresh();
    expect(await new TracedPlace(kv).code()).toBe('AMS');
  });
});
