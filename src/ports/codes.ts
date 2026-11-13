import type { DetectedMarker } from '../domain/cards';

/** A camera frame: what `ImageData` holds, named here so the ports need no browser types. */
export interface CameraFrame {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Finds answer cards in a camera frame. */
export interface MarkerDetector {
  detect(frame: CameraFrame): DetectedMarker[];
}

/** Draws the printable marker for a card number, as an SVG string. */
export interface MarkerRenderer {
  markerSvg(cardNumber: number): string;
}

/** Draws a QR code for a link, as an SVG string. */
export interface QrRenderer {
  qrSvg(text: string): string;
}
