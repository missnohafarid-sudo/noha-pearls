import type { DayThresholds, OffenceRule, SocketCaps, WatchCaps, WindowLimit } from '../domain/abuse';
import type { RetryPolicy } from '../domain/reconnect';
/** The one home of the sizes the transport holds to; the page, the Worker and the hub all ask here. */

/** The longest message a visitor's or student's socket may send, in characters. */
export const MAX_MESSAGE_LENGTH = 64_000;

/** The teacher saves whole lessons in one message. */
export const MAX_ADMIN_MESSAGE_LENGTH = 2_000_000;

export const messageLimitFor = (isAdmin: boolean): number => (isAdmin ? MAX_ADMIN_MESSAGE_LENGTH : MAX_MESSAGE_LENGTH);

/** The attachment of a socket may hold 16 KB, and an Arabic character takes two bytes of it; this keeps well inside. */
export const MAX_ATTACHMENT_CHARACTERS = 6_000;

/** The body of a plain request (sign-in), in bytes. */
export const MAX_POST_BODY_BYTES = 1024;

/** A remembered answer is kept only if the text naming its question is no longer than this. */
export const MAX_CACHE_KEY_LENGTH = 1024;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * A school sits behind one network address, so nothing here is counted per address except the teacher's sign-in and the number of
 * new devices an address may be given. Everything else is counted per device: a script gets one device's share, not the school's.
 * A rule's `max` is the count that makes an offender: the offence that reaches it locks the subject for `lockMs`, so one less is free.
 */
/** Messages a device may send in the window, over all its sockets together. */
export const DEVICE_MESSAGES: WindowLimit = { max: 120, windowMs: 10 * SECOND };
export const DEVICE_FLOODS: OffenceRule = { max: 3, windowMs: 10 * MINUTE, lockMs: 10 * MINUTE };
export const DEVICE_MISSES: OffenceRule = { max: 21, windowMs: 10 * MINUTE, lockMs: 10 * MINUTE };
export const DEVICE_SEAT_CHANGES: WindowLimit = { max: 6, windowMs: HOUR };
export const ADDRESS_NEW_TOKENS: WindowLimit = { max: 1500, windowMs: HOUR };

/** Sign-in: the fifth wrong attempt locks that network address; more than ten wrong codes behind the right password (the eleventh) close sign-in for everyone. */
export const ADDRESS_WRONG_SIGN_INS: OffenceRule = { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
export const SCHOOL_CODE_GUESSES: OffenceRule = { max: 11, windowMs: HOUR, lockMs: HOUR };

/** Open sockets and live reads. The admin is held to none of them; the shared ones (address, hub) refuse visitors only. */
export const SOCKETS_PER_DEVICE = 6;
export const SOCKETS_PER_ADDRESS = 400;
export const SOCKETS_PER_HUB = 3000;
export const SOCKET_CAPS: SocketCaps = { perDevice: SOCKETS_PER_DEVICE, perAddress: SOCKETS_PER_ADDRESS, perHub: SOCKETS_PER_HUB };
export const WATCHES_PER_DEVICE = 48;
export const WATCHES_PER_HUB = 20_000;
export const WATCH_CAPS: WatchCaps = { perDevice: WATCHES_PER_DEVICE, perHub: WATCHES_PER_HUB };

export const WAITING_SEATS_PER_STUDENT = 2;
export const WAITING_SHARED_SEATS_PER_CLASS = 10;
export const PEER_HEARTS_PER_GIVER = 10;
export const ANSWER_CHANGES_PER_QUESTION = 30;

/** Rows written in a UTC day: above the first only the essential writes (answering, joining, leaving) are allowed for non-admins, above the second no write is. */
export const DAY_ROWS_ANSWERS_ONLY = 80_000;
export const DAY_ROWS_CLOSED = 95_000;
export const DAY_THRESHOLDS: DayThresholds = { answersOnlyAbove: DAY_ROWS_ANSWERS_ONLY, closedAbove: DAY_ROWS_CLOSED };
export const DAY_ROWS_FLUSH_MS = MINUTE;

/** The page opens its socket again quickly for the first minutes, then slows down; a refused page waits at least half of `limitedMs`. */
export const RECONNECT: RetryPolicy = { firstMs: 500, quickTries: 8, quickMaxMs: 15 * SECOND, slowMaxMs: MINUTE, limitedMs: MINUTE };

/** How many values of one kind a place that computes once for everyone keeps before it forgets the oldest. */
export const MAX_COMPUTED_ENTRIES = 256;
/** How many different card results one class's reading keeps: a card number is the visitor's to invent. */
export const MAX_CARD_RESULTS_PER_CLASS = 64;
/** How many answers to recent questions the store remembers (`infrastructure/sql/resultCache.ts`). */
export const MAX_REMEMBERED_QUERIES = 256;
/** How many classes' packed rows the store keeps read (`infrastructure/sql/packedRows.ts`). */
export const MAX_REMEMBERED_ROWS = 64;
/** How long the page waits between messages before it sends one to keep the socket open. */
export const KEEP_ALIVE_MS = SECOND * 30;

/** The longest name a socket's service or method may carry. */
export const MAX_WIRE_NAME_LENGTH = 64;
