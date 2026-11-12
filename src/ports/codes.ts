import type { DetectedMarker } from '../domain/cards';

/** Finds answer cards in a camera frame. */
export interface MarkerDetector {
  detect(frame: ImageData): DetectedMarker[];
}

/** Draws the printable marker for a card number, as an SVG string. */
export interface MarkerRenderer {
  markerSvg(cardNumber: number): string;
}

/** Draws a QR code for a link, as an SVG string. */
export interface QrRenderer {
  qrSvg(text: string): string;
}
