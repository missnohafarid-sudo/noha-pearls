import { describe, expect, it } from 'vitest';
import { newId, newJoinCode, normalizeJoinCode } from './ids';

describe('ids', () => {
  it('are unique across many calls and have the same shape', () => {
    const ids = Array.from({ length: 2000 }, newId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('join codes', () => {
  it('have the requested length, six by default', () => {
    expect(newJoinCode()).toHaveLength(6);
    expect(newJoinCode(10)).toHaveLength(10);
  });

  it('use only letters and digits that are not confused when read aloud', () => {
    for (let i = 0; i < 500; i++) expect(newJoinCode(12)).toMatch(/^[A-HJKMNP-Z2-9]+$/);
  });
});

describe('normalizeJoinCode', () => {
  it('turns lower case into upper case', () => {
    expect(normalizeJoinCode('abc234')).toBe('ABC234');
  });

  it('removes spaces inside and around the code', () => {
    expect(normalizeJoinCode('  ab c2 34\t')).toBe('ABC234');
  });

  it('turns Arabic-Indic digits into Latin ones', () => {
    expect(normalizeJoinCode('abc٢٣٤')).toBe('ABC234');
  });

  it('leaves a clean code unchanged', () => {
    expect(normalizeJoinCode('ABC234')).toBe('ABC234');
  });
});
