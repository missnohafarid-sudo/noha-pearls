import type { ContentSlide, MediaSlide, Slide } from './models';
import type { SlideKindSpec } from './slideFile';
import { hiddenPartKeys, keepOpenedParts, partKey, slideTextBlocks } from './slideText';

/** The members of a slide-kind entry that deal with hidden parts, for the kinds whose text can hold some. */
type HiddenPartMembers<S extends Slide> = Pick<SlideKindSpec<S>, 'hiddenPartKeys' | 'withOpenedParts'>;

/** The key of a content slide's end-of-slide part, or null when that text draws nothing and so is no part. Older stored slides lack the field. */
export function endHiddenKey(hidden: string | undefined): string | null {
  const text = hidden ?? '';
  return slideTextBlocks(text).length > 0 ? partKey(text) : null;
}

/** A content slide's parts are those in its body, then its end-of-slide text, which comes last. */
export const contentHiddenParts: HiddenPartMembers<ContentSlide> = {
  hiddenPartKeys: ({ body, hidden }) => {
    const end = endHiddenKey(hidden);
    return [...hiddenPartKeys(body), ...(end === null ? [] : [end])];
  },
  withOpenedParts: (slide, opened) => {
    const end = endHiddenKey(slide.hidden);
    return { ...slide, body: keepOpenedParts(slide.body, opened), hidden: end !== null && opened.includes(end) ? (slide.hidden ?? '') : '' };
  },
};

export const mediaHiddenParts: HiddenPartMembers<MediaSlide> = {
  hiddenPartKeys: ({ body }) => hiddenPartKeys(body),
  withOpenedParts: (slide, opened) => ({ ...slide, body: keepOpenedParts(slide.body, opened) }),
};
