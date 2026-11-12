import { useEffect, useRef, type RefObject } from 'react';
import type { DetectedMarker } from '../../domain/cards';
import { useCardCodec } from '../hooks/data';

const SCAN_INTERVAL_MS = 120;
const MAX_FRAME_WIDTH = 1280;

export interface MarkerFramesInput {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /** Read frames only while the camera delivers them. */
  active: boolean;
  /** Receives, every frame, the markers that `labelFor` accepted. */
  onMarkers: (markers: readonly DetectedMarker[]) => void;
  /** The text drawn beside a marker, or null to ignore that marker (it is neither drawn nor reported). */
  labelFor: (marker: DetectedMarker) => string | null;
}

interface OverlayStyle {
  color: string;
  font: string;
}

/** The overlay's look comes from the page's CSS, so it follows the theme. */
function overlayStyle(overlay: HTMLCanvasElement): OverlayStyle {
  const computed = getComputedStyle(overlay);
  return { color: computed.getPropertyValue('--ok').trim(), font: `bold 28px ${computed.fontFamily}` };
}

function drawMarker(ctx: CanvasRenderingContext2D, marker: DetectedMarker, label: string, style: OverlayStyle): void {
  ctx.beginPath();
  marker.corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = style.color;
  ctx.stroke();
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.fillText(label, marker.corners[0].x, marker.corners[0].y - 8);
}

/** The one camera frame loop: grabs a frame about every 120 ms, detects markers, outlines them. */
export function useMarkerFrames({ videoRef, overlayRef, active, onMarkers, labelFor }: MarkerFramesInput): void {
  const codec = useCardCodec();
  const latest = useRef({ onMarkers, labelFor });
  useEffect(() => {
    latest.current = { onMarkers, labelFor };
  });

  useEffect(() => {
    if (!codec || !active) return undefined;
    const firstOverlay = overlayRef.current;
    if (!firstOverlay) return undefined;
    const style = overlayStyle(firstOverlay);
    const work = document.createElement('canvas');
    let busy = false;

    const tick = () => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (busy || !video || !overlay || video.videoWidth === 0) return;
      busy = true;
      try {
        const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
        work.width = Math.round(video.videoWidth * scale);
        work.height = Math.round(video.videoHeight * scale);
        const workCtx = work.getContext('2d', { willReadFrequently: true });
        const ctx = overlay.getContext('2d');
        if (!workCtx || !ctx) return;
        workCtx.drawImage(video, 0, 0, work.width, work.height);
        overlay.width = work.width;
        overlay.height = work.height;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        const accepted: DetectedMarker[] = [];
        for (const marker of codec.detect(workCtx.getImageData(0, 0, work.width, work.height))) {
          const label = latest.current.labelFor(marker);
          if (label === null) continue;
          drawMarker(ctx, marker, label, style);
          accepted.push(marker);
        }
        latest.current.onMarkers(accepted);
      } finally {
        busy = false;
      }
    };

    const timer = window.setInterval(tick, SCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [codec, active, videoRef, overlayRef]);
}
