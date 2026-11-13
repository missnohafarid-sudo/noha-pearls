import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { SAMPLE, SLIDE } from '../sample';
import type { World } from '../world';

const BADGE = '.slide .scope-badge';

/** Opens slide `index` (0-based) of the imported lesson on the lesson page and waits until it is the one shown. */
async function showSlide(world: World, index: number): Promise<void> {
  await world.admin.goto(`#/lesson/${encodeURIComponent(world.importedLessonId)}/${index + 1}`);
  await world.admin.waitFor(t.common.slideOf(index + 1, SAMPLE.slides.length));
}

const badgeTexts = (world: World) => world.admin.texts(BADGE);

/** The lesson page says who answers each question, and says nothing on a slide that is not a question. */
export function scopeBadgeSteps(world: World): void {
  let lessonPage = '';

  it('an individual question shows the individual badge and not the group one', async () => {
    lessonPage = world.admin.page.url();
    expect(SAMPLE.slides[SLIDE.firstQuestion].scope).toBe('individual');
    await showSlide(world, SLIDE.firstQuestion);
    await world.admin.until('the individual badge', async () => (await badgeTexts(world)).length === 1);
    expect(await badgeTexts(world)).toEqual([t.common.scope.individual]);
    expect(await world.admin.exists('.slide .scope-badge--individual')).toBe(true);
    expect(await world.admin.exists('.slide .scope-badge--group')).toBe(false);
  });

  it('a group question shows the group badge and not the individual one', async () => {
    expect(SAMPLE.slides[SLIDE.groupText].scope).toBe('group');
    await showSlide(world, SLIDE.groupText);
    await world.admin.until('the group badge', async () => (await badgeTexts(world)).length === 1);
    expect(await badgeTexts(world)).toEqual([t.common.scope.group]);
    expect(await world.admin.exists('.slide .scope-badge--group')).toBe(true);
    expect(await world.admin.exists('.slide .scope-badge--individual')).toBe(false);
  });

  it('a slide that is not a question shows no badge', async () => {
    await showSlide(world, SLIDE.opening);
    expect(await world.admin.count(BADGE)).toBe(0);
  });

  it('the lesson page is left where it was', async () => {
    await world.admin.page.goto(lessonPage);
    await world.admin.until('the lesson page as it was', async () => world.admin.page.url() === lessonPage);
  });
}
