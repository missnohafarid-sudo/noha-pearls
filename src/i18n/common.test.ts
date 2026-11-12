import { describe, expect, it } from 'vitest';
import { MAX_CHOICES } from '../domain/choices';
import { CHOICE_LETTERS, choiceLetter, common, counted, isolate, listed } from './common';
import { home } from './home';

describe('option letters', () => {
  it('has exactly one letter for each allowed option', () => {
    expect(CHOICE_LETTERS).toHaveLength(MAX_CHOICES);
  });

  it('gives each option its letter and a placeholder beyond the last', () => {
    expect(choiceLetter(0)).toBe(CHOICE_LETTERS[0]);
    expect(choiceLetter(MAX_CHOICES)).toBe('?');
  });
});

describe('isolating a name in a sentence', () => {
  it('wraps it in isolate marks and keeps the text itself', () => {
    expect(isolate('11-4')).toBe('⁨11-4⁩');
  });
});

describe('numbers in Arabic lines', () => {
  it('reads the slide counter as "slide of total", never with a slash that flips in right-to-left text', () => {
    expect(common.slideOf(3, 13)).toBe('3 من 13');
  });

  it('says whose hearts a heart count is, with the name isolated', () => {
    expect(common.heartsOf('سلمى أحمد', 2)).toBe('قلوب ⁨سلمى أحمد⁩: 2');
  });
});

describe('counted nouns', () => {
  const points = { one: 'نقطة واحدة', two: 'نقطتان', few: 'نقاط', many: 'نقطة', hundred: 'نقطة' };

  it('uses the singular and the dual alone, the plural for 0 and 3 to 10, and the singular after the number from 11', () => {
    expect([1, 2, 0, 3, 10, 11, 25].map((n) => counted(n, points))).toEqual(['نقطة واحدة', 'نقطتان', '0 نقاط', '3 نقاط', '10 نقاط', '11 نقطة', '25 نقطة']);
  });

  it('uses the plain singular from 100', () => {
    const hearts = { one: 'قلب واحد', two: 'قلبان', few: 'قلوب', many: 'قلبًا', hundred: 'قلب' };
    expect([99, 100, 250].map((n) => counted(n, hearts))).toEqual(['99 قلبًا', '100 قلب', '250 قلب']);
    expect(counted(100, points)).toBe('100 نقطة');
  });

  it('uses the singular after the number for a fraction', () => {
    expect(counted(2.5, points)).toBe('2.5 نقطة');
  });
});

describe('names in a list', () => {
  const [a, b, c] = ['أ. نهى', 'أ. مريم', 'أ. سارة'].map(isolate);

  it('lists one name alone, two with "و", and more with commas and a last "و"', () => {
    expect(listed([])).toBe('');
    expect(listed(['أ. نهى'])).toBe(a);
    expect(listed(['أ. نهى', 'أ. مريم'])).toBe(`${a} و${b}`);
    expect(listed(['أ. نهى', 'أ. مريم', 'أ. سارة'])).toBe(`${a}، ${b} و${c}`);
  });
});

describe('the teachers line of the home page', () => {
  it('says the label in the singular, the dual or the plural to match the names', () => {
    expect(home.teachersLine(['أ. نهى'])).toBe(`المعلّمة: ${isolate('أ. نهى')}`);
    expect(home.teachersLine(['أ. نهى', 'أ. مريم'])).toMatch(/^المعلّمتان: /);
    expect(home.teachersLine(['أ. نهى', 'أ. مريم', 'أ. سارة'])).toMatch(/^المعلّمات: /);
  });

  it('says nothing when there are no teachers', () => {
    expect(home.teachersLine([])).toBe('');
  });
});
