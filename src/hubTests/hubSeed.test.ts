import { describe, expect, it } from 'vitest';
import { LOCAL_SAMPLE_SCHOOL } from '../../vite.config';
import { wantsSampleSchool } from '../server/sampleSchool';
import { createHarness } from './hubHarness';

describe('what a hub starts with', () => {
  it('has the site’s wording and the example lesson and nobody’s invented people when the sample school is not asked for', async () => {
    const harness = createHarness();
    await harness.core.seed(false);
    expect(await harness.store.get('site', 'site')).not.toBeNull();
    const lessons = await harness.store.list('lessons');
    expect(lessons).toHaveLength(1);
    expect(lessons[0].published).toBe(true);
    for (const collection of ['classes', 'teachers', 'groups', 'students'] as const) expect(await harness.store.list(collection), collection).toEqual([]);
  });

  it('also has a class list, a teacher, groups and students when the sample school is asked for', async () => {
    const harness = createHarness();
    await harness.core.seed(true);
    expect(await harness.store.list('lessons')).toHaveLength(1);
    for (const collection of ['classes', 'teachers', 'groups', 'students'] as const) expect((await harness.store.list(collection)).length, collection).toBeGreaterThan(0);
  });

  it('keeps what is there: a second start adds nothing, even if the sample school is asked for then', async () => {
    const harness = createHarness();
    await harness.core.seed(false);
    await harness.core.seed(true);
    expect(await harness.store.list('teachers')).toEqual([]);
  });

  it('asks for the sample school only when the variable is exactly 1', () => {
    expect(wantsSampleSchool({ SAMPLE_SCHOOL: '1' })).toBe(true);
    for (const value of [undefined, '', '0', 'true', 1, 'yes']) expect(wantsSampleSchool({ SAMPLE_SCHOOL: value })).toBe(false);
    expect(wantsSampleSchool({})).toBe(false);
    expect(wantsSampleSchool(LOCAL_SAMPLE_SCHOOL)).toBe(true);
  });
});
