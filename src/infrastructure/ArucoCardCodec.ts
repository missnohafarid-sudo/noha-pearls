import aruco from './vendor/aruco.mjs';
import { CARD_DICTIONARY, type DetectedMarker } from '../domain/cards';
import type { MarkerDetector, MarkerRenderer } from '../ports/codes';

/** Reads and draws answer-card markers with the js-aruco2 library (MIT), vendored by `npm run vendor:aruco`. */
export class ArucoCardCodec implements MarkerDetector, MarkerRenderer {
  private readonly detector = new aruco.AR.Detector({ dictionaryName: CARD_DICTIONARY });
  private readonly dictionary = new aruco.AR.Dictionary(CARD_DICTIONARY);

  detect(frame: ImageData): DetectedMarker[] {
    return this.detector.detect(frame).map(({ id, corners }) => ({ id, corners }));
  }

  markerSvg(cardNumber: number): string {
    return this.dictionary.generateSVG(cardNumber);
  }
}
