import type { DayThresholds, SocketCaps, WindowLimit } from '../domain/abuse';
import type { RetryPolicy } from '../domain/reconnect';
/** The one home of the sizes the transport holds to; the page, the Worker and the hub all ask here. */

/** The longest message a visitor's or student's socket may send, in characters. */
export const MAX_MESSAGE_LENGTH = 64_000;

/** The teacher saves whole lessons in one message. */
export const MAX_ADMIN_MESSAGE_LENGTH = 2_000_000;

export const messageLimitFor = (isAdmin: boolean): number => (isAdmin ? MAX_ADMIN_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH);

/** The attachment of a socket may hold 16 KB, and an Arabic character takes two bytes of it; these keep well inside. */
export const MAX_WATCHES = 48;
export const MAX_ATTACHMENT_CHARACTERS = 6_000;

/** The body of a plain request (sign-in), in bytes. */
export const MAX_POST_BODY_BYTES = 1024;

/** A remembered answer is kept only if the text naming its question is no longer than this. */
export const MAX_CACHE_KEY_LENGTH = 1024;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** A school of 35 devices behind one network address stays well inside every number below; a script does not. */
export const SOCKET_MESSAGES: WindowLimit = { max: 120, windowMs: 10 * SECOND };
export const ADDRESS_STRIKES: WindowLimit = { max: 3, windowMs: 10 * MINUTE };
export const ADDRESS_LOCK_MS = 10 * MINUTE;
export const ADDRESS_MISSES: WindowLimit = { max: 20, windowMs: 10 * MINUTE };
export const SCHOOL_MISSES: WindowLimit = { max: 3000, windowMs: HOUR };
export const SOCKET_CARDS: WindowLimit = { max: 40, windowMs: 5 * MINUTE };
export const DEVICE_JOINS: WindowLimit = { max: 10, windowMs: MINUTE };
export const ADDRESS_NEW_TOKENS: WindowLimit = { max: 300, windowMs: HOUR };

export const SOCKETS_PER_DEVICE = 6;
export const SOCKETS_PER_ADDRESS = 400;
export const SOCKETS_PER_HUB = 3000;
export const WATCHES_PER_HUB = 20_000;
export const SOCKET_CAPS: SocketCaps = { perDevice: SOCKETS_PER_DEVICE, perAddress: SOCKETS_PER_ADDRESS, perHub: SOCKETS_PER_HUB };

/** How long an address that looked up too many wrong class codes is refused further lookups. */
export const LOOKUP_LOCK_MS = 10 * MINUTE;

export const WAITING_SEATS_PER_STUDENT = 2;
export const WAITING_SHARED_SEATS_PER_CLASS = 10;
export const PEER_HEARTS_PER_GIVER = 10;
export const ANSWER_CHANGES_PER_QUESTION = 30;

/** Rows written in a UTC day: above the first only answering is allowed for non-admins, above the second nothing is. */
export const DAY_ROWS_ANSWERS_ONLY = 80_000;
export const DAY_ROWS_CLOSED = 95_000;
export const DAY_THRESHOLDS: DayThresholds = { answersOnlyAbove: DAY_ROWS_ANSWERS_ONLY, closedAbove: DAY_ROWS_CLOSED };
export const DAY_ROWS_FLUSH_MS = MINUTE;

/** The page opens its socket again quickly for the first minutes, then slows down; a refused page waits at least half of `limitedMs`. */
export const RECONNECT: RetryPolicy = { firstMs: 500, quickTries: 8, quickMaxMs: 15 * SECOND, slowMaxMs: MINUTE, limitedMs: MINUTE };
