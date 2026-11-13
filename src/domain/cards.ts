/**
 * Answer cards. Each student holds one printed square marker whose id is their
 * card number. The edge held upward is the chosen option, so one camera sweep
 * reads the whole class. This encoding matches the cards already in use
 * (ArUco 4x4, id = roster number), so existing printouts keep working.
 */

/** Marker family, shared by the printer and the scanner. */
export const CARD_DICTIONARY = 'ARUCO_4X4_1000';
export const MIN_CARD_NUMBER = 1;
export const MAX_CARD_NUMBER = 999;

/** Whether a number can be on a printed card at all. */
export function isCardNumber(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_CARD_NUMBER && value <= MAX_CARD_NUMBER;
}

export interface Point {
  x: number;
  y: number;
}

export interface DetectedMarker {
  id: number;
  /** Clockwise from the marker's own top-left corner, in image coordinates. */
  corners: readonly Point[];
}

/**
 * The option a card shows: the index of the marker edge that is highest in the
 * image. Edge 0 is the marker's own top edge, then clockwise.
 */
export function choiceFromCorners(corners: readonly Point[]): number {
  let best = 0;
  let bestY = Infinity;
  for (let edge = 0; edge < 4; edge += 1) {
    const midY = (corners[edge].y + corners[(edge + 1) % 4].y) / 2;
    if (midY < bestY) {
      bestY = midY;
      best = edge;
    }
  }
  return best;
}

export interface CardReading {
  cardNumber: number;
  choice: number;
}

/** Readings for a scan that only asks who is present: the option a card shows is irrelevant, so every sighting is the same reading. */
export function presenceReadings(markers: readonly DetectedMarker[]): CardReading[] {
  return markers.map((marker) => ({ cardNumber: marker.id, choice: 0 }));
}

/**
 * Turns camera frames into answers. A reading counts once the same choice is
 * seen on consecutive frames (which filters out cards caught mid-rotation); a
 * card missing from a frame loses its pending count. A choice is reported once,
 * then again only when it changes or after `forget`.
 */
export class CardReadStabilizer {
  private pending = new Map<number, { choice: number; count: number }>();
  private readonly reported = new Map<number, number>();

  constructor(private readonly requiredRepeats = 2) {}

  /** Takes everything seen in one frame; returns the readings that have just become stable or have changed. */
  observeFrame(readings: readonly CardReading[]): CardReading[] {
    const next = new Map<number, { choice: number; count: number }>();
    const stable: CardReading[] = [];
    for (const { cardNumber, choice } of readings) {
      const previous = this.pending.get(cardNumber);
      const count = previous && previous.choice === choice ? previous.count + 1 : 1;
      next.set(cardNumber, { choice, count });
      if (count >= this.requiredRepeats && this.reported.get(cardNumber) !== choice) {
        this.reported.set(cardNumber, choice);
        stable.push({ cardNumber, choice });
      }
    }
    this.pending = next;
    return stable;
  }

  /** The next stable reading of this card is reported again. */
  forget(cardNumber: number): void {
    this.reported.delete(cardNumber);
  }
}
