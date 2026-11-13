import type { Unsubscribe } from '../ports/store';
import type { ServiceClasses } from './Services';
import { LOCAL_SURFACE, UI_SURFACE } from './Services';
import { argumentsFit } from './surfaceShapes';

export type SurfaceKind = 'call' | 'watch';

/** Why a name was refused: not on the table, the wrong kind of use for it, the wrong number of arguments, a live-read number already in use, or more live reads than one connection may hold. */
export class SurfaceError extends Error {
  constructor(readonly code: 'unknown-method' | 'wrong-kind' | 'bad-arguments' | 'duplicate-watch' | 'too-many-watches') {
    super(code);
    this.name = 'SurfaceError';
  }
}

/** A `watch…` name is a live read; every other name is a command or a one-shot question. */
export const isWatchName = (method: string): boolean => method.startsWith('watch');

/** Whether the page answers this name itself, so that it never reaches the hub. */
export function isLocalMethod(service: string, method: string): boolean {
  return Object.hasOwn(LOCAL_SURFACE, service) && (LOCAL_SURFACE[service as keyof typeof LOCAL_SURFACE] as readonly string[]).includes(method);
}

/** How a name on the table may be used for the hub, or null when it is not on the table or is one the page answers itself. */
export function surfaceKind(service: string, method: string): SurfaceKind | null {
  if (!Object.hasOwn(UI_SURFACE, service)) return null;
  const names: readonly string[] = UI_SURFACE[service as keyof typeof UI_SURFACE];
  if (!names.includes(method) || isLocalMethod(service, method)) return null;
  return isWatchName(method) ? 'watch' : 'call';
}

type Method = (...args: unknown[]) => unknown;

/**
 * Runs a service method by name, only if the table lists it, is used the right way and gets the arguments it declares
 * (every method's parameters are plain: no default or rest parameter, which `Function.length` would not count; a test holds them to it).
 * It knows nothing of sockets: the transport hands it names and values and takes back a result or an unsubscribe.
 */
export class SurfaceDispatcher {
  constructor(private readonly services: ServiceClasses) {}

  async call(service: string, method: string, args: readonly unknown[]): Promise<unknown> {
    return this.method(service, method, 'call', args, args.length)(...args);
  }

  watch(service: string, method: string, args: readonly unknown[], listener: (value: unknown) => void): Unsubscribe {
    return this.method(service, method, 'watch', args, args.length + 1)(...args, listener) as Unsubscribe;
  }

  private method(service: string, name: string, kind: SurfaceKind, args: readonly unknown[], given: number): Method {
    const found = surfaceKind(service, name);
    if (found === null) throw new SurfaceError('unknown-method');
    if (found !== kind) throw new SurfaceError('wrong-kind');
    const target = this.services[service as keyof ServiceClasses] as unknown as Record<string, Method>;
    const method = target[name];
    if (method.length !== given || !argumentsFit(service, name, args)) throw new SurfaceError('bad-arguments');
    return method.bind(target);
  }
}
