import { useEffect, useRef, useState } from 'react';
import { isMediaProblem, mediaLink, mediaView, PDF_ZOOM_STEPS, steppedZoom, type MediaView } from '../../domain/media';
import type { MediaSlide } from '../../domain/models';
import { t } from '../../i18n';
import { useAdmin } from '../hooks/data';
import { BodyText } from './BodyText';
import './media.css';
import type { SlideBodyProps } from './slideUi';
import { zoomClassName } from './zoomClass';

const tm = t.slides.media;

type FrameView = Extract<MediaView, { how: 'frame' }>;

function Frame({ view, title }: { view: FrameView; title: string }) {
  const [zoom, setZoom] = useState(PDF_ZOOM_STEPS[0]);
  const zoomable = view.shape === 'pdf';
  const box = useRef<HTMLDivElement>(null);

  // A wider frame starts at the box's edge; the page the viewer centres is what she wants to see.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const sign = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
    element.scrollLeft = (sign * (element.scrollWidth - element.clientWidth)) / 2;
  }, [zoom]);

  return (
    <div className="media">
      {zoomable && (
        <div className="row media__zoom">
          <button type="button" className="btn btn--small" aria-label={tm.zoomOut} disabled={zoom === steppedZoom(zoom, -1)} onClick={() => setZoom(steppedZoom(zoom, -1))}>
            −
          </button>
          <span className="media__zoom-level">{tm.zoomLevel(zoom)}</span>
          <button type="button" className="btn btn--small" aria-label={tm.zoomIn} disabled={zoom === steppedZoom(zoom, 1)} onClick={() => setZoom(steppedZoom(zoom, 1))}>
            +
          </button>
        </div>
      )}
      <div ref={box} className={`media__box media__box--${view.shape}`}>
        <div className={zoomable ? `media__zoomer ${zoomClassName(zoom)}` : 'media__zoomer'}>
          <iframe
            className={zoomable ? 'media__frame media__frame--zoomed' : 'media__frame'}
            src={view.src}
            title={title}
            sandbox={view.sandbox ?? undefined}
            allow="fullscreen"
            referrerPolicy={view.referrerPolicy}
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

function Player({ view, title, onFailed }: { view: MediaView; title: string; onFailed: () => void }) {
  switch (view.how) {
    case 'image':
      return <img className="media__image" src={view.src} alt={title} referrerPolicy="no-referrer" onError={onFailed} />;
    case 'audio':
      return <audio className="media__audio" src={view.src} controls preload="metadata" onError={onFailed} />;
    case 'video':
      return <video className="media__video" src={view.src} controls playsInline preload="metadata" onError={onFailed} />;
    case 'frame':
      return <Frame view={view} title={title} />;
  }
}

/** What stands in place of the media: the teacher is told what to do, everyone else only that it cannot be shown. */
function noticeFor(view: ReturnType<typeof mediaView>, failedSrc: string | null, admin: boolean): string | null {
  if (isMediaProblem(view)) return admin ? tm.problem[view] : tm.viewerProblem;
  if (view.src === failedSrc) return admin ? tm.loadFailedTeacher : tm.viewerProblem;
  return null;
}

export function MediaBody({ slide }: SlideBodyProps<MediaSlide>) {
  const admin = useAdmin();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const view = mediaView(slide.url, slide.media);
  const notice = noticeFor(view, failedSrc, admin);
  const shown = isMediaProblem(view) ? null : view;
  const link = mediaLink(slide.url);
  return (
    <div className="slide-media">
      {notice ? (
        <p className="notice notice--bad">{notice}</p>
      ) : (
        shown && <Player view={shown} title={slide.title || tm.frameTitle} onFailed={() => setFailedSrc(shown.src)} />
      )}
      {link && (
        <a className="media__open" href={link} target="_blank" rel="noopener noreferrer">
          {tm.open}
        </a>
      )}
      {slide.body && <BodyText text={slide.body} />}
    </div>
  );
}
