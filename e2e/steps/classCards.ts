import { expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { World } from '../world';

const CARD = '.session-list__item';
const TEACHER = '.session-list__teacher';
const MIN_GAP = 8;

interface CardFacts {
  text: string;
  opaque: boolean;
  teacher: string;
  teacherSize: number;
  largestOtherSize: number;
  teacherIsFirst: boolean;
  box: { top: number; bottom: number; left: number; right: number };
}

/** What the page really draws for every class card: its colour, its sizes, its place. */
function cardFacts(world: World): Promise<CardFacts[]> {
  return world.admin.page.$$eval(
    CARD,
    (cards, teacherSelector) =>
      cards.map((card) => {
        const teacher = card.querySelector<HTMLElement>(teacherSelector as string);
        const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
        const others = [...card.querySelectorAll('*')].filter((element) => element !== teacher && element.textContent?.trim() && !element.querySelector('*'));
        const box = card.getBoundingClientRect();
        return {
          text: (card as HTMLElement).innerText,
          opaque: /^rgb\(/.test(getComputedStyle(card).backgroundColor),
          teacher: teacher?.innerText ?? '',
          teacherSize: teacher ? size(teacher) : 0,
          largestOtherSize: Math.max(0, ...others.map(size)),
          teacherIsFirst: teacher !== null && card.querySelector('*:not(div)') === teacher,
          box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
        };
      }),
    TEACHER,
  );
}

/** The class cards of the session page: a running class and an ended one are solid cards named by their teacher. */
export function classCardsSteps(world: World): void {
  let cards: CardFacts[] = [];
  let pageBefore = '';

  it('the session page draws the running class and the ended class as cards', async () => {
    pageBefore = world.admin.page.url();
    await world.admin.goto('#/session');
    await world.admin.waitFor(t.session.chooser.endedTitle);
    await world.admin.until('a running class card and an ended class card', async () => (await world.admin.count(CARD)) >= 2);
    cards = await cardFacts(world);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('every card has a fully solid background', () => {
    for (const card of cards) expect(card.opaque).toBe(true);
  });

  it('the teacher\'s name comes first on every card and is its largest text', () => {
    for (const card of cards) {
      expect(card.teacher).not.toBe('');
      expect(card.teacherIsFirst).toBe(true);
      expect(card.teacherSize).toBeGreaterThan(card.largestOtherSize);
    }
    expect(cards.some((card) => card.teacher === world.firstTeacherName && card.text.includes(world.firstClassCode))).toBe(true);
  });

  it('no two cards touch', () => {
    for (const [index, card] of cards.entries()) {
      for (const other of cards.slice(index + 1)) {
        const apartVertically = Math.max(card.box.top - other.box.bottom, other.box.top - card.box.bottom);
        const apartSideways = Math.max(card.box.left - other.box.right, other.box.left - card.box.right);
        expect(Math.max(apartVertically, apartSideways)).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });

  it('the teacher\'s page is left where it was', async () => {
    await world.admin.page.goto(pageBefore);
    await world.admin.waitFor(t.session.pacingTitle);
  });
}
