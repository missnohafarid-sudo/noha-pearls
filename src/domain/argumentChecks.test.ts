import { describe, expect, it } from 'vitest';
import { integer, isAnswerValue, isCard, isClassCode, isId, isPeriod, listOf, nullable, oneOf, optional, shape, text } from './argumentChecks';
import { isDateRange, isGroup, isLesson, isSiteContent, isStudent, isSubject, isYearEnd } from './entityChecks';
import { addSlide, createLesson } from './lessonOps';
import { periodAt } from './periods';
import { SLIDE_KIND_NAMES } from './slideKinds';
import { lesson } from './visibility.fixtures';

describe('the small checkers', () => {
  it('hold an id to a non-empty string of at most 64 characters', () => {
    expect([isId('a'), isId('x'.repeat(64))]).toEqual([true, true]);
    expect([isId(''), isId('x'.repeat(65)), isId(5), isId(null), isId({}), isId(undefined)]).toEqual([false, false, false, false, false, false]);
  });

  it('hold integers to their range and refuse fractions, NaN and strings', () => {
    const check = integer(0, 10);
    expect([check(0), check(10), check(11), check(-1), check(1.5), check(Number.NaN), check('1')]).toEqual([true, true, false, false, false, false, false]);
  });

  it('read a class code through the code normaliser, so spaces, case and Arabic digits do not matter, and long or odd text is refused', () => {
    expect([isClassCode('abc234'), isClassCode(' AB C 2٣4 '), isClassCode('A'.repeat(13)), isClassCode('AB-C'), isClassCode(''), isClassCode(7), isClassCode(' '.repeat(65))]).toEqual([true, true, false, false, false, false, false]);
  });

  it('hold a card number to 1 to 999', () => {
    expect([isCard(1), isCard(999), isCard(0), isCard(1000), isCard(2.5), isCard('1')]).toEqual([true, true, false, false, false, false]);
  });

  it('take a period only when the calendar makes it', () => {
    const week = periodAt('week', 1_800_000_000_000);
    expect(isPeriod(week)).toBe(true);
    expect(isPeriod({ ...week, end: week.end + 1 })).toBe(false);
    expect(isPeriod({ ...week, start: week.start + 1 })).toBe(false);
    expect(isPeriod({ kind: 'year', start: 0, end: 1 })).toBe(false);
    expect(isPeriod({ ...week, extra: 1 })).toBe(false);
  });

  it('take answers as an option number or a text of bounded size', () => {
    expect([isAnswerValue(2), isAnswerValue('نص'), isAnswerValue('x'.repeat(2401)), isAnswerValue(-1), isAnswerValue(null), isAnswerValue([1])]).toEqual([true, true, false, false, false, false]);
  });

  it('build lists, optional values, choices and exact shapes', () => {
    expect([listOf(isId, 2)(['a', 'b']), listOf(isId, 2)(['a', 'b', 'c']), listOf(isId)('a')]).toEqual([true, false, false]);
    expect([nullable(isId)(null), nullable(isId)(3), oneOf('a', 'b')('c'), text(3)('abcd')]).toEqual([true, false, false, false]);
    const point = shape({ x: integer(0, 5) });
    const later = shape({ x: integer(0, 5), y: optional(integer(0, 5)) });
    expect([later({ x: 1 }), later({ x: 1, y: 2 }), later({ x: 1, y: 'a' }), later({ y: 2 }), later({ x: 1, z: 1 }), later({ x: 1, y: null })]).toEqual([true, true, false, false, false, false]);
    expect([point({ x: 1 }), point({ x: 1, y: 2 }), point({}), point(null), point([])]).toEqual([true, false, false, false, false]);
  });
});

describe('the shapes of whole objects', () => {
  it('accept a stored group, student, subject, site, year end and range, and refuse a changed field', () => {
    expect(isGroup({ id: 'g', classId: 'c', name: 'n', color: '#fff', order: 1 })).toBe(true);
    expect(isGroup({ id: 'g', classId: 'c', name: 'n', color: '#fff', order: 'x' })).toBe(false);
    expect(isStudent({ id: 's', cardNumber: 3, name: 'n', groupId: 'g' })).toBe(true);
    expect(isStudent({ id: 's', cardNumber: 3000, name: 'n', groupId: 'g' })).toBe(false);
    expect(isSubject({ kind: 'student', id: 's' })).toBe(true);
    expect(isSubject({ kind: 'teacher', id: 's' })).toBe(false);
    expect(isSiteContent({ id: 'site', schoolName: 'a', title: 'b', tagline: 'c', intro: 'd' })).toBe(true);
    expect(isSiteContent({ id: 'site', schoolName: 'a'.repeat(3000), title: 'b', tagline: 'c', intro: 'd' })).toBe(false);
    expect([isYearEnd(null), isYearEnd({ month: 6, day: 30 }), isYearEnd({ month: 13, day: 1 })]).toEqual([true, true, false]);
    const day = { year: 2026, month: 1, day: 2 };
    expect([isDateRange({ from: day, to: day }), isDateRange({ from: day })]).toEqual([true, false]);
  });

  it('hold a lesson to its structure only, so a lesson that is not finished can be saved', () => {
    expect(isLesson(lesson)).toBe(true);
    expect(isLesson({ ...lesson, slides: [] })).toBe(true);
    expect(isLesson({ ...lesson, title: '' })).toBe(true);
    expect(isLesson({ ...lesson, slides: [{ ...lesson.slides[0], kind: 'video' }] })).toBe(false);
    expect(isLesson({ ...lesson, slides: [{ kind: lesson.slides[0].kind }] })).toBe(false);
    expect(isLesson({ ...lesson, slides: [lesson.slides[0], lesson.slides[0]] })).toBe(false);
    expect(isLesson({ ...lesson, extra: true })).toBe(false);
    expect(isLesson('lesson')).toBe(false);
  });

  it('accept the blank slide the editor adds, of every kind', () => {
    for (const kind of SLIDE_KIND_NAMES) expect(isLesson(addSlide(createLesson('x', null), kind, -1).lesson), kind).toBe(true);
  });
});
