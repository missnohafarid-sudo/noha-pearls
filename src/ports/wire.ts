/**
 * The one definition of what travels over the page's single socket. Every message is one JSON text.
 * The page sends `call`, `watch` and `unwatch`; the hub answers `hello` once, first, then `result`, `value` and `watch-refused`.
 * A socket's identity never changes: when it must, the hub closes the socket and the page opens a new one.
 */
import { isRecord } from '../domain/argumentChecks';
import { MAX_ADMIN_MESSAGE_LENGTH, MAX_WIRE_NAME_LENGTH } from './limits';

/** An error as it crosses the wire: its class name and its code, never a stack or an internal message. */
export interface WireError {
  name: string;
  code?: string;
}

/** What the page's link reports for a call that did not get an answer because the socket was not there. */
export const CONNECTION_LOST = 'ConnectionLostError';

export type ClientMessage =
  | { type: 'call'; id: number; service: string; method: string; args: unknown[] }
  | { type: 'watch'; id: number; service: string; method: string; args: unknown[] }
  | { type: 'unwatch'; id: number };

export type ServerMessage =
  | { type: 'hello'; admin: boolean; now: number }
  | { type: 'result'; id: number; ok: true; value?: unknown }
  | { type: 'result'; id: number; ok: false; error: WireError }
  | { type: 'value'; id: number; value: unknown }
  | { type: 'watch-refused'; id: number; error: WireError };

/** What a call came to for the page: the value, or the error as it crossed the wire. */
export type CallOutcome = { ok: true; value: unknown } | { ok: false; error: WireError };

export const LIVE_PATH = '/api/live';
export const HELLO_PATH = '/api/hello';
export const SIGN_IN_PATH = '/api/sign-in';
export const SIGN_OUT_PATH = '/api/sign-out';

/** The page's keep-alive text and the hub's answer, answered by the platform without waking the hub. */
export const PING = 'ping';
export const PONG = 'pong';

export const HEALTH_PATH = '/api/health';
/** Every path the Worker forwards to the hub; any other `/api/` path is answered by the Worker alone. */
export const HUB_PATHS: readonly string[] = [LIVE_PATH, HELLO_PATH, SIGN_IN_PATH, SIGN_OUT_PATH];

/** Why the hub closes a socket: it sent something not allowed, the teacher's session on it has ended, or it sent too fast. */
export const CLOSE_POLICY = 1008;
export const CLOSE_SESSION_ENDED = 4001;
export const CLOSE_RATE_LIMITED = 4008;
/** The socket that sent too fast once too often: its device is now refused for a while. */
export const CLOSE_DEVICE_LOCKED = 4009;
/** The hub has handed its data to the hub that replaced it; the page reconnects as after any lost connection, and reaches the new one. */
export const CLOSE_HUB_MOVED = 1012;

/** What the hub answers a request it will not take from this device or address, or at this load. It says nothing of why. */
export const STATUS_TOO_MANY = 429;

/** What the hub answers a hello when the network address has been given all the new devices it may have for now. It says only that. */
export const STATUS_NETWORK_FULL = 423;

/** What a hub that has handed its data to the hub that replaced it answers every request. */
export const STATUS_HUB_MOVED = 503;

/** What `POST /api/hello` answers, and what `hello` carries. */
export interface Hello {
  admin: boolean;
  now: number;
}

/** What `POST /api/sign-in` answers: yes or no, never which part was wrong; `closed` when sign-in is shut for everyone for a while. (It takes the page's `AdminCredentials`.) */
export interface SignInAnswer {
  ok: boolean;
  closed?: true;
}

export const encode = (message: ClientMessage | ServerMessage): string => JSON.stringify(message);

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_WIRE_NAME_LENGTH;

function parseJson(text: string, maxLength: number): unknown {
  if (text.length > maxLength) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The message the page sent, or null when the text is longer than `maxLength` or is not one of the three shapes. */
export function parseClientMessage(text: string, maxLength: number): ClientMessage | null {
  const raw = parseJson(text, maxLength);
  if (!isRecord(raw) || !isId(raw.id)) return null;
  if (raw.type === 'unwatch') return { type: 'unwatch', id: raw.id };
  if ((raw.type !== 'call' && raw.type !== 'watch') || !isName(raw.service) || !isName(raw.method) || !Array.isArray(raw.args)) return null;
  return { type: raw.type, id: raw.id, service: raw.service, method: raw.method, args: raw.args };
}

const isWireError = (value: unknown): value is WireError => isRecord(value) && typeof value.name === 'string' && (value.code === undefined || typeof value.code === 'string');

/** The message the hub sent, or null when the text is not one of the shapes. */
export function parseServerMessage(text: string): ServerMessage | null {
  const raw = parseJson(text, MAX_ADMIN_MESSAGE_LENGTH);
  if (!isRecord(raw)) return null;
  if (raw.type === 'hello') return typeof raw.admin === 'boolean' && typeof raw.now === 'number' ? { type: 'hello', admin: raw.admin, now: raw.now } : null;
  if (!isId(raw.id)) return null;
  if (raw.type === 'value') return { type: 'value', id: raw.id, value: raw.value };
  if (raw.type === 'watch-refused') return isWireError(raw.error) ? { type: 'watch-refused', id: raw.id, error: raw.error } : null;
  if (raw.type !== 'result') return null;
  if (raw.ok === true) return { type: 'result', id: raw.id, ok: true, value: raw.value };
  return raw.ok === false && isWireError(raw.error) ? { type: 'result', id: raw.id, ok: false, error: raw.error } : null;
}

/** True when the value comes back from JSON unchanged: no undefined, function, NaN, Map, Set or Date anywhere. */
export function isWireValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isWireValue);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.values(value).every(isWireValue);
}
