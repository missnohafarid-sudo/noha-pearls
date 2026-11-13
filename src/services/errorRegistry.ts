import { CONNECTION_LOST, type WireError } from '../ports/wire';
import { NotAuthorizedError } from './AuthService';
import { LimitError } from './LimitError';
import { LessonError } from './LessonService';
import { RetentionError } from './RetentionService';
import { RosterError } from './RosterService';
import { FolderError } from './requireFolder';
import { NameError } from './requireName';
import { TeacherError } from './TeacherService';
import { SurfaceError } from './surfaceDispatch';

/** The page could not reach the hub. It is made on the page, never sent by the hub. */
export class ConnectionLostError extends Error {
  constructor() {
    super('Connection lost');
    this.name = CONNECTION_LOST;
  }
}

/** A failure the hub does not describe to the page: it is logged there, and the page only knows that it failed. */
export class ServiceFailure extends Error {
  constructor() {
    super('The request failed');
    this.name = 'ServiceFailure';
  }
}

type Maker = (code: string | undefined) => Error;

/**
 * The one list of the errors that cross the wire, by class name. The hub encodes with it and the page decodes with it,
 * so the page's checks (`instanceof RosterError`, `error.code`) work on the same classes.
 */
const MAKERS: Record<string, Maker> = {
  NotAuthorizedError: () => new NotAuthorizedError(),
  NameError: () => new NameError(),
  RosterError: (code) => new RosterError(code as RosterError['code']),
  TeacherError: (code) => new TeacherError(code as TeacherError['code']),
  LessonError: (code) => new LessonError(code as LessonError['code']),
  FolderError: (code) => new FolderError(code as FolderError['code']),
  RetentionError: (code) => new RetentionError(code as RetentionError['code']),
  LimitError: (code) => new LimitError(code as LimitError['code']),
  SurfaceError: (code) => new SurfaceError(code as SurfaceError['code']),
  [CONNECTION_LOST]: () => new ConnectionLostError(),
};

/** The name and code of a registered error; null for anything else, which the caller logs and does not send on. */
export function encodeError(error: unknown): WireError | null {
  if (!(error instanceof Error) || !Object.hasOwn(MAKERS, error.name)) return null;
  const { code } = error as Error & { code?: unknown };
  return typeof code === 'string' ? { name: error.name, code } : { name: error.name };
}

/** What every error the hub does not describe is sent as. */
export const GENERIC_FAILURE: WireError = { name: 'ServiceFailure' };

/** The error as it may cross the wire: a registered one by name and code, anything else as the bare failure. */
export const wireErrorOf = (error: unknown): WireError => encodeError(error) ?? GENERIC_FAILURE;

/** The same class the hub threw, or a `ServiceFailure` for a name this page does not know. */
export function decodeError({ name, code }: WireError): Error {
  return Object.hasOwn(MAKERS, name) ? MAKERS[name](code) : new ServiceFailure();
}

export const REGISTERED_ERROR_NAMES: readonly string[] = Object.keys(MAKERS);
