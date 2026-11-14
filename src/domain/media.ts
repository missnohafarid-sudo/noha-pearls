import type { MediaChoice, MediaType } from './models';

/**
 * What a media link shows and how. The one place that reads a pasted address:
 * it names the provider's own embeddable address, the frame's shape and the
 * least sandbox that still lets the page work. Every rule was measured with
 * real links in a real browser. The UI draws what `mediaView` returns.
 */

/** Every media type; the record type makes the compiler reject a missing or extra one. */
const MEDIA_FLAGS: Record<MediaType, true> = { audio: true, image: true, video: true, pdf: true, embed: true };
export const MEDIA_TYPES = Object.keys(MEDIA_FLAGS) as MediaType[];

/** What a teacher may declare: `auto` lets the link decide, or one of the types. */
export const MEDIA_CHOICES: readonly MediaChoice[] = ['auto', ...MEDIA_TYPES];

/** Frames send nothing about the page, except where the provider refuses to play without knowing it. */
type FrameReferrer = 'no-referrer' | 'strict-origin-when-cross-origin';

export type MediaView =
  | { how: 'image'; src: string }
  | { how: 'audio'; src: string }
  | { how: 'video'; src: string }
  | { how: 'frame'; src: string; shape: MediaType; sandbox: string | null; referrerPolicy: FrameReferrer };

/** What can be known about a link before anything is drawn. */
type MediaProblem = 'no-link' | 'not-https' | 'unknown-type' | 'page-link';

export function isMediaChoice(value: unknown): value is MediaChoice {
  return MEDIA_CHOICES.some((choice) => choice === value);
}

function parseHttps(text: string): URL | null {
  try {
    const address = new URL(text);
    return address.protocol === 'https:' ? address : null;
  } catch {
    return null;
  }
}

export function isHttpsUrl(text: string): boolean {
  return parseHttps(text.trim()) !== null;
}

/** The normalised https address of a pasted link, the only form safe to put in a page; `null` when it is not https. */
export function mediaLink(text: string): string | null {
  return parseHttps(text.trim())?.href ?? null;
}

const frame = (src: string, shape: MediaType, sandbox: string | null, referrerPolicy: FrameReferrer = 'no-referrer'): MediaView => ({
  how: 'frame',
  src,
  shape,
  sandbox,
  referrerPolicy,
});

/** A provider turns an address it recognises into what to draw, or into what is wrong with it; `null` means "not mine". */
type Provider = (address: URL, declared: MediaChoice) => MediaView | MediaProblem | null;

const DRIVE_FILE = /^\/file\/d\/([\w-]+)/;
const DRIVE_ID = /^[\w-]+$/;
const DRIVE_SANDBOX = 'allow-scripts allow-same-origin';

/** Drive's own viewer plays audio and video and shows photos and PDFs; plain elements fail on every Drive address. A GIF animates in both the viewer and the thumbnail address, which serves the file itself, not a still (measured, files up to 8 MB). */
const drive: Provider = (address, declared) => {
  if (address.hostname !== 'drive.google.com') return null;
  const id = DRIVE_FILE.exec(address.pathname)?.[1] ?? (address.pathname === '/open' ? address.searchParams.get('id') : null);
  if (!id || !DRIVE_ID.test(id)) return null;
  if (declared === 'image') return { how: 'image', src: `https://drive.google.com/thumbnail?id=${id}&sz=w2000` };
  return frame(`https://drive.google.com/file/d/${id}/preview`, declared === 'auto' ? 'embed' : declared, DRIVE_SANDBOX);
};

const PHET_PAGE = /^\/[^/]+\/simulations\/([a-z0-9-]+)\/?$/;

/** The simulation's page refuses framing; its HTML5 file does not. */
const phet: Provider = (address) => {
  if (address.hostname !== 'phet.colorado.edu') return null;
  const name = PHET_PAGE.exec(address.pathname)?.[1];
  if (!name) return null;
  return frame(`https://phet.colorado.edu/sims/html/${name}/latest/${name}_all.html?locale=ar`, 'embed', 'allow-scripts');
};

/** A PowerPoint sharing link refuses framing; the same address with `?action=embedview` does not. */
const sharepointSlides: Provider = (address) => {
  if (!address.hostname.endsWith('.sharepoint.com') || !address.pathname.startsWith('/:p:/')) return null;
  return frame(`${address.origin}${address.pathname}?action=embedview`, 'embed', 'allow-scripts allow-same-origin allow-forms');
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_ID = /^[\w-]+$/;
const YOUTUBE_PATH = /^\/(?:shorts|embed|live)\/([\w-]+)\/?$/;

function youtubeId(address: URL): string | null {
  if (address.hostname === 'youtu.be') return address.pathname.slice(1);
  if (!YOUTUBE_HOSTS.has(address.hostname)) return null;
  if (address.pathname === '/watch') return address.searchParams.get('v');
  return YOUTUBE_PATH.exec(address.pathname)?.[1] ?? null;
}

/** The watch page refuses framing; the no-cookie embed address does not, but its player reports error 153 unless it is told which site embeds it. */
const youtube: Provider = (address) => {
  const id = youtubeId(address);
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return frame(`https://www.youtube-nocookie.com/embed/${id}`, 'video', 'allow-scripts allow-same-origin', 'strict-origin-when-cross-origin');
};

const GIPHY_PAGE = /^\/(?:gifs|stickers|embed)\/(?:[^/]*-)?([A-Za-z0-9]+)\/?$/;

/** A Giphy page refuses framing and is not an image, but its id (the last part of the page name) names the image: `i.giphy.com/ID.gif` is a plain animated GIF (measured, it animates in an img). */
const giphy: Provider = (address) => {
  if (address.hostname !== 'giphy.com' && address.hostname !== 'www.giphy.com') return null;
  const id = GIPHY_PAGE.exec(address.pathname)?.[1];
  return id ? { how: 'image', src: `https://i.giphy.com/${id}.gif` } : null;
};

const TENOR_PAGE = /^\/(?:[A-Za-z-]+\/)?view\//;

/** A Tenor page (also under a language, as in `/ar/view/`) refuses framing, and its number is not the image's name (measured: the image address is only inside the page), so only the image address itself can be shown. */
const tenor: Provider = (address) => (address.hostname === 'tenor.com' && TENOR_PAGE.test(address.pathname) ? 'page-link' : null);

const PROVIDERS: readonly Provider[] = [drive, phet, sharepointSlides, youtube, giphy, tenor];

const EXTENSIONS = new Map<string, MediaType>(Object.entries<MediaType>({
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  mp4: 'video',
  webm: 'video',
  pdf: 'pdf',
}));

function extensionOf(address: URL): string {
  const name = address.pathname.slice(address.pathname.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Chrome refuses to show its PDF viewer inside any sandboxed frame, so only an address that really is a PDF file goes unsandboxed. */
const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

function viewAs(type: MediaType, address: URL): MediaView {
  const src = address.href;
  if (type === 'image' || type === 'audio' || type === 'video') return { how: type, src };
  return frame(src, type, type === 'pdf' && extensionOf(address) === 'pdf' ? null : EMBED_SANDBOX);
}

/** What to draw for a pasted link and the type the teacher declared, or what is wrong with it. A declared type wins over the address. */
export function mediaView(url: string, declared: MediaChoice): MediaView | MediaProblem {
  const text = url.trim();
  if (text === '') return 'no-link';
  const address = parseHttps(text);
  if (!address) return 'not-https';
  for (const provider of PROVIDERS) {
    const view = provider(address, declared);
    if (view) return view;
  }
  const type = declared === 'auto' ? (EXTENSIONS.get(extensionOf(address)) ?? null) : declared;
  return type ? viewAs(type, address) : 'unknown-type';
}

/** Whether a text is a picture by itself: one address, spaces around it allowed but none inside, of an image file, a Giphy page or a Google Drive file. Any other link, or a link with words, is not. */
export function isPictureLink(text: string): boolean {
  const address = /^\S+$/.test(text.trim()) ? parseHttps(text.trim()) : null;
  if (!address) return false;
  if (drive(address, 'image')) return true;
  const view = mediaView(text, 'auto');
  return !isMediaProblem(view) && view.how === 'image';
}

export function isMediaProblem(result: MediaView | MediaProblem): result is MediaProblem {
  return typeof result === 'string';
}

/** How many photos a slide may carry. */
export const MAX_PICTURES = 6;

/** A photo link the teacher has filled in but the slide cannot show as a photo (an empty entry is only unfinished). */
function isPictureProblem(link: string): boolean {
  if (link.trim() === '') return false;
  const view = mediaView(link, 'image');
  return isMediaProblem(view) || view.how !== 'image';
}

export function picturesHaveProblem(links: readonly string[]): boolean {
  return links.some(isPictureProblem);
}

/** The addresses to draw for a slide's photo links, in order: each goes through the same rule as an image declared on a media slide. */
export function pictureSources(links: readonly string[]): string[] {
  return links.flatMap((link) => {
    const view = mediaView(link, 'image');
    return !isMediaProblem(view) && view.how === 'image' ? [view.src] : [];
  });
}

/** The zoom a PDF frame may take, in percent of its box. */
export const PDF_ZOOM_STEPS: readonly number[] = [100, 150, 200, 300];

/** The zoom one step in `direction` from `current`; the same zoom at either end. */
export function steppedZoom(current: number, direction: 1 | -1): number {
  const at = PDF_ZOOM_STEPS.indexOf(current);
  const next = Math.max(0, Math.min(PDF_ZOOM_STEPS.length - 1, (at < 0 ? 0 : at) + direction));
  return PDF_ZOOM_STEPS[next];
}
