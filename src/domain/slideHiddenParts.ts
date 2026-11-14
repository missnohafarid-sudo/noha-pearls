import type { ContentSlide, MediaSlide, Slide } from './models';
import type { SlideKindSpec } from './slideFile';
import { hiddenPartCount, keepOpenedParts } from './slideText';

/** The members of a slide-kind entry that deal with hidden parts, for the kinds whose text can hold some. */
type HiddenPartMembers<S extends Slide> = Pick<SlideKindSpec<S>, 'hiddenPartCount' | 'withOpenedParts'>;

/** The end-of-slide hidden text, which older stored slides lack. */
const endHidden = ({ hidden }: { hidden?: string }): string => hidden ?? '';

/** A content slide's parts are those in its body, then its end-of-slide text when not blank, which comes last. */
export const contentHiddenParts: HiddenPartMembers<ContentSlide> = {
  hiddenPartCount: (slide) => hiddenPartCount(slide.body) + (endHidden(slide).trim() === '' ? 0 : 1),
  withOpenedParts: (slide, opened) => ({
    ...slide,
    body: keepOpenedParts(slide.body, opened),
    hidden: opened.includes(hiddenPartCount(slide.body)) ? endHidden(slide) : '',
  }),
};

export const mediaHiddenParts: HiddenPartMembers<MediaSlide> = {
  hiddenPartCount: ({ body }) => hiddenPartCount(body),
  withOpenedParts: (slide, opened) => ({ ...slide, body: keepOpenedParts(slide.body, opened) }),
};
