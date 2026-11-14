import { describe, expect, it } from 'vitest';
import { fingerprint, isFingerprint } from './fingerprint';
import type { ChoiceSlide, ContentSlide, MediaSlide } from './models';
import { endHiddenKey } from './slideHiddenParts';
import { slideHiddenPartKeys, slideKindSpec, withOpenedParts } from './slideKinds';
import { HIDDEN_FENCE as F, partKey } from './slideText';

const content = (body: string, hidden: string): ContentSlide => ({ ...(slideKindSpec('content').create('c') as ContentSlide), body, hidden });
const media = (body: string): MediaSlide => ({ ...(slideKindSpec('media').create('m') as MediaSlide), body });
const BODY = ['a', F, 'x', F, 'b', F, 'y', F].join('\n');
const [X, Y, END] = [partKey('x'), partKey('y'), partKey('end')];

describe('fingerprint', () => {
  it('is 8 hex characters, the same for the same text and different for another', () => {
    expect(fingerprint('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(fingerprint('')).toBe('811c9dc5');
  });

  it('recognises only its own shape', () => {
    expect(isFingerprint(fingerprint('x'))).toBe(true);
    for (const bad of ['', 'xyz', '0A1B2C3D', '0a1b2c3', '0a1b2c3d4', 1, null]) expect(isFingerprint(bad)).toBe(false);
  });
});

describe('a slide kind and its hidden parts', () => {
  it('lists a content slide`s parts in its text, then its end-of-slide text when it draws something', () => {
    expect(slideHiddenPartKeys(content(BODY, ''))).toEqual([X, Y]);
    expect(slideHiddenPartKeys(content(BODY, '  '))).toEqual([X, Y]);
    expect(slideHiddenPartKeys(content(BODY, 'end'))).toEqual([X, Y, END]);
    expect(slideHiddenPartKeys(content('plain', 'end'))).toEqual([END]);
  });

  it('decides the end-of-slide part in one place: blank or drawing nothing is none', () => {
    expect(endHiddenKey('end')).toBe(END);
    expect(endHiddenKey('  end ')).toBe(END);
    expect(endHiddenKey('')).toBeNull();
    expect(endHiddenKey('  \n ')).toBeNull();
    expect(endHiddenKey('|---|\n|---|')).toBeNull();
    expect(endHiddenKey('|---|')).toBe(partKey('|---|'));
    expect(endHiddenKey(undefined)).toBeNull();
  });

  it('lists a media slide`s parts in its text, and none for a kind without hidden parts', () => {
    expect(slideHiddenPartKeys(media(BODY))).toEqual([X, Y]);
    expect(slideHiddenPartKeys(slideKindSpec('choice').create('q'))).toEqual([]);
  });

  it('keeps only the opened parts of a content slide, the end-of-slide one being the last', () => {
    const slide = content(BODY, 'end');
    expect(withOpenedParts(slide, [])).toEqual({ ...slide, body: 'a\nb', hidden: '' });
    expect(withOpenedParts(slide, [Y, END])).toEqual({ ...slide, body: ['a', 'b', F, 'y', F].join('\n'), hidden: 'end' });
  });

  it('opens the end-of-slide part by its words, whatever body parts are added later', () => {
    const slide = content(['new', F, 'first', F, BODY].join('\n'), 'end');
    expect(withOpenedParts(slide, [END])).toMatchObject({ body: 'new\na\nb', hidden: 'end' });
    expect(withOpenedParts(content(BODY, 'end changed'), [END])).toMatchObject({ hidden: '' });
  });

  it('opens identical parts together', () => {
    const slide = content(['a', F, 'same', F, 'b', F, 'same', F].join('\n'), 'same');
    expect(withOpenedParts(slide, [partKey('same')])).toEqual(slide);
  });

  it('keeps only the opened parts of a media slide', () => {
    expect(withOpenedParts(media(BODY), [X])).toMatchObject({ body: ['a', F, 'x', F, 'b'].join('\n') });
  });

  it('treats a stored content slide without the end-of-slide field as having none', () => {
    const { hidden: _, ...old } = content(BODY, '');
    expect(slideHiddenPartKeys(old as ContentSlide)).toEqual([X, Y]);
    expect(withOpenedParts(old as ContentSlide, [END])).toMatchObject({ body: 'a\nb', hidden: '' });
  });

  it('returns a slide of a kind without hidden parts as it is', () => {
    const slide: ChoiceSlide = slideKindSpec('choice').create('q') as ChoiceSlide;
    expect(withOpenedParts(slide, [X])).toBe(slide);
  });
});
