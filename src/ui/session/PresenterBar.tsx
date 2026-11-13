import { isQuestion, isRevealed } from '../../domain/answering';
import type { Session, Slide } from '../../domain/models';
import { t } from '../../i18n';
import { useServices } from '../ServicesContext';
import { SlideNav } from '../slides/SlideNav';

interface PresenterBarProps {
  session: Session;
  slide: Slide | undefined;
  slideCount: number;
  /** The slide keys also work; false while an overlay is open over the page. */
  keyboard: boolean;
  codesShown: boolean;
  onToggleCodes: () => void;
  /** Card scanning for the slide on screen; null when it is not allowed. */
  scan: { on: boolean; toggle: () => void } | null;
  fullscreen: { active: boolean; toggle: () => void };
}

/** The presenting bar, docked under the stage so it is on screen whatever the window, also in full screen. While the join codes are shown the slide is not, so it cannot be moved, answered or scanned. */
export function PresenterBar({ session, slide, slideCount, keyboard, codesShown, onToggleCodes, scan, fullscreen }: PresenterBarProps) {
  const { sessions } = useServices();
  const slideShown = !codesShown;
  return (
    <div className="presenter__bar">
      <SlideNav index={session.slideIndex} count={slideCount} onGo={(i) => void sessions.goTo(session.id, i)} keyboard={keyboard} disabled={codesShown} />
      {slideShown && slide && isQuestion(slide) && (
        <button type="button" className="btn" disabled={isRevealed(session, slide.id)} onClick={() => void sessions.reveal(session.id, slide.id)}>
          {t.session.reveal}
        </button>
      )}
      {slideShown && scan && (
        <button type="button" className="btn" aria-pressed={scan.on} onClick={scan.toggle}>
          {scan.on ? t.session.closeScan : t.session.scan}
        </button>
      )}
      <button type="button" className="btn" aria-pressed={codesShown} onClick={onToggleCodes}>
        {codesShown ? t.session.hideJoinCodes : t.session.showJoinCodes}
      </button>
      <div className="presenter__end">
        <button type="button" className="btn" onClick={fullscreen.toggle}>
          {fullscreen.active ? t.common.exitFullscreen : t.common.fullscreen}
        </button>
      </div>
    </div>
  );
}
