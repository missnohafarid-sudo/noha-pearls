import { describe, expect, it, vi } from 'vitest';
import type { BoardTotal } from '../domain/visibility';
import { classroom, seatFor } from './classKit';
import { connect } from './hubHarness';

const counted = vi.hoisted(() => ({ totals: 0 }));

vi.mock('../domain/visibility', async (original) => {
  const actual = await original<typeof import('../domain/visibility')>();
  return { ...actual, boardTotals: (...args: Parameters<typeof actual.boardTotals>) => ((counted.totals += 1), actual.boardTotals(...args)) };
});

const address = (n: number) => `10.${Math.floor(n / 250)}.${n % 250}.1`;

describe('what many watchers of one class are shown alike', () => {
  it('is computed once for 500 board watchers when one answer comes in, and every one of them is shown the same', async () => {
    const { harness, admin, session, students, lessonId } = await classroom();
    const watchers = Array.from({ length: 500 }, (_, n) => connect(harness, `board-${n}`, null, address(n)));
    for (const watcher of watchers) await watcher.watch(1, 'board', 'watchTotals', session.code);
    const student = students[0];
    const { phone } = await seatFor(harness, admin, session.code, 'student-phone', student.id, student.groupId);
    const lesson = (await harness.store.get('lessons', lessonId))!;
    const slide = lesson.slides.find((candidate) => candidate.kind === 'choice')!;
    await admin.call(3, 'sessions', 'goTo', session.id, lesson.slides.indexOf(slide));
    counted.totals = 0;
    expect(await phone.call(9, 'answers', 'submitFromDevice', session.id, slide.id, 0)).toMatchObject({ ok: true, value: true });
    expect(counted.totals).toBe(1);
    const last = (watcher: (typeof watchers)[number]) => watcher.socket.values(1).at(-1) as BoardTotal[];
    expect(watchers.every((watcher) => last(watcher).length > 0)).toBe(true);
    expect(new Set(watchers.map((watcher) => JSON.stringify(last(watcher)))).size).toBe(1);
  });

  it('costs the hub nothing for 500 readers of a class that does not exist when a slide changes', async () => {
    const { harness, admin, session, lessonId } = await classroom();
    const lesson = (await harness.store.get('lessons', lessonId))!;
    const slideChange = async (index: number) => {
      harness.sql.reset();
      await admin.call(1000 + index, 'sessions', 'goTo', session.id, index);
      return harness.sql.statements;
    };
    await slideChange(1);
    const alone = await slideChange(2);
    const strangers = Array.from({ length: 500 }, (_, n) => connect(harness, `stranger-${n}`, null, address(n)));
    for (const [n, stranger] of strangers.entries()) {
      await stranger.watch(1, 'seatView', 'watchLesson', `invented-${n}`);
      await stranger.watch(2, 'seatView', 'watchMine', `invented-${n}`);
    }
    expect(strangers.every((stranger) => stranger.socket.values(1)[0] === null && stranger.socket.values(2)[0] === null)).toBe(true);
    expect(await slideChange(3)).toBe(alone);
    expect(lesson.slides.length).toBeGreaterThan(3);
  });
});
