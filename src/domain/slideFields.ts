import { isHttpsUrl } from './media';
import type { IssueReporter, RawSlide } from './slideFile';

/** How the slide kinds read the loose fields of a lesson file, and how they repair what older stored slides lack. */

export function text(raw: RawSlide, field: string): string {
  const value = raw[field];
  return typeof value === 'string' ? value.trim() : '';
}

export function requiredText(raw: RawSlide, field: string, report: IssueReporter): string {
  const value = text(raw, field);
  if (!value) report('missing-field', field);
  return value;
}

export const trimmedLinks = (links: readonly string[]) => links.map((link) => link.trim()).filter((link) => link !== '');

export const isAbsent = (value: unknown) => value === undefined || value === null;

/** A list of photo links from a file: the new `images`, or the one `imageUrl` that older files held. Entries are trimmed, blanks dropped, and every kept link must be https. */
export function picturesOf(raw: RawSlide, report: IssueReporter): string[] {
  const modern = !isAbsent(raw.images);
  const field = modern ? 'images' : 'imageUrl';
  const listed = modern ? raw.images : [raw.imageUrl];
  if (!Array.isArray(listed) || !listed.every((link) => isAbsent(link) || typeof link === 'string')) {
    report('bad-images', field);
    return [];
  }
  const links = listed.flatMap((link: unknown) => (typeof link === 'string' && link.trim() !== '' ? [link.trim()] : []));
  if (!links.every(isHttpsUrl)) report('bad-url', field);
  return links;
}

/** Stored before pictures became a list: a content slide held one `imageUrl`, a text slide had no pictures. */
export interface StoredPictures {
  images?: string[];
  imageUrl?: string;
}

export function storedPictures({ images, imageUrl }: StoredPictures): string[] {
  return images ?? (imageUrl ? [imageUrl] : []);
}
