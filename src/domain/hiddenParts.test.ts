import { describe, expect, it } from 'vitest';
import type { ChoiceSlide, ContentSlide, MediaSlide } from './models';
import { slideHiddenPartCount, slideKindSpec, withOpenedParts } from './slideKinds';
import { HIDDEN_FENCE as F } from './slideText';

const content = (body: string, hidden: string): ContentSlide => ({ ...(slideKindSpec('content').create('c') as ContentSlide), body, hidden });
const media = (body: string): MediaSlide => ({ ...(slideKindSpec('media').create('m') as MediaSlide), body });
const BODY = ['a', F, 'x', F, 'b', F, 'y', F].join('\n');

describe('a slide kind and its hidden parts', () => {
  it('counts a content slide`s parts in its text, then its end-of-slide text when not blank', () => {
    expect(slideHiddenPartCount(content(BODY, ''))).toBe(2);
    expect(slideHiddenPartCount(content(BODY, '  '))).toBe(2);
    expect(slideHiddenPartCount(content(BODY, 'end'))).toBe(3);
    expect(slideHiddenPartCount(content('plain', 'end'))).toBe(1);
  });

  it('counts a media slide`s parts in its text, and a kind without hidden parts as none', () => {
    expect(slideHiddenPartCount(media(BODY))).toBe(2);
    expect(slideHiddenPartCount(slideKindSpec('choice').create('q'))).toBe(0);
  });

  it('keeps only the opened parts of a content slide, the end-of-slide one being the last', () => {
    const slide = content(BODY, 'end');
    expect(withOpenedParts(slide, [])).toEqual({ ...slide, body: 'a\nb', hidden: '' });
    expect(withOpenedParts(slide, [1, 2])).toEqual({ ...slide, body: ['a', 'b', F, 'y', F].join('\n'), hidden: 'end' });
  });

  it('keeps only the opened parts of a media slide', () => {
    expect(withOpenedParts(media(BODY), [0])).toMatchObject({ body: ['a', F, 'x', F, 'b'].join('\n') });
  });

  it('treats a stored content slide without the end-of-slide field as having none', () => {
    const { hidden: _, ...old } = content(BODY, '');
    expect(slideHiddenPartCount(old as ContentSlide)).toBe(2);
    expect(withOpenedParts(old as ContentSlide, [2])).toMatchObject({ body: 'a\nb', hidden: '' });
  });

  it('returns a slide of a kind without hidden parts as it is', () => {
    const slide: ChoiceSlide = slideKindSpec('choice').create('q') as ChoiceSlide;
    expect(withOpenedParts(slide, [0])).toBe(slide);
  });
});
