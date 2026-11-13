import { cardFits, isOverLimit, withCard, withEvent, type CardsSeen } from '../domain/abuse';
import type { Id } from '../domain/models';
import { SOCKET_CARDS, SOCKET_MESSAGES } from '../ports/limits';
import type { AbuseGuard } from '../ports/abuse';
import { CLOSE_ADDRESS_LOCKED, CLOSE_RATE_LIMITED } from '../ports/wire';
import type { Gatekeeper } from './Gatekeeper';

/**
 * What one socket is held to: how fast it may send, and the guard the services ask. What is counted per socket (messages, card
 * numbers) is kept here and dies with the socket; what is counted per address or device is the gatekeeper's.
 */
export class ConnectionLimits {
  readonly guard: AbuseGuard;
  private messages: number[] = [];
  private cards: CardsSeen = {};

  constructor(
    private readonly gate: Gatekeeper,
    readonly address: string,
    device: Id,
    private readonly now: () => number,
  ) {
    this.guard = {
      lookupAllowed: () => gate.lookupAllowed(address),
      recordMiss: () => gate.recordMiss(address),
      joinAllowed: () => gate.joinAllowed(device),
      cardAllowed: (card) => this.cardAllowed(card),
    };
  }

  /** Counts a message that has just arrived and says whether the socket is still within its rate. */
  messageAllowed(): boolean {
    this.messages = withEvent(this.messages, this.now(), SOCKET_MESSAGES.windowMs);
    return !isOverLimit(this.messages, this.now(), SOCKET_MESSAGES);
  }

  /** The socket sent too fast: its address gets a strike. The code to close the socket with. */
  flooded(): number {
    return this.gate.strike(this.address) ? CLOSE_ADDRESS_LOCKED : CLOSE_RATE_LIMITED;
  }

  watchAllowed(): boolean {
    return this.gate.watchAllowed();
  }

  private cardAllowed(card: number): boolean {
    if (!cardFits(this.cards, card, this.now(), SOCKET_CARDS)) return false;
    this.cards = withCard(this.cards, card, this.now(), SOCKET_CARDS.windowMs);
    return true;
  }
}
