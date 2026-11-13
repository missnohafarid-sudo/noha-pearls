import { lessonFileText } from '../domain/lessonFormat';
import { periodAt, type PeriodKind } from '../domain/periods';
import type { RefusableListener, RemoteLink } from '../ports/remote';
import { decodeError } from './errorRegistry';
import { LOCAL_SURFACE, UI_SURFACE, type DataServices } from './Services';
import { isLocalMethod, isWatchName } from './surfaceDispatch';

type Stubs = { [service: string]: { [method: string]: (...args: never[]) => unknown } };

/** What answers each name of `LOCAL_SURFACE` here; the type makes the compiler reject a missing or extra one. `now` is the hub's clock. */
const localMethods = (now: () => number): { [S in keyof typeof LOCAL_SURFACE]: Record<(typeof LOCAL_SURFACE)[S][number], (...args: never[]) => unknown> } => ({
  lessons: { exportToText: lessonFileText },
  records: { currentPeriod: (kind: PeriodKind) => periodAt(kind, now()) },
});

/**
 * The data services as the page sees them when the real ones run on the hub: for every name of `UI_SURFACE`, a
 * live read (`watch…`) opens a watch on the link and returns its way to stop, and any other name sends a command and
 * waits for its answer, which is the value or the same error class the hub threw. The names in `LOCAL_SURFACE` are answered here.
 */
export function createRemoteServices(link: RemoteLink, hubNow: () => number): DataServices {
  const local: Stubs = localMethods(hubNow);
  const stubs: Stubs = {};
  for (const [service, methods] of Object.entries(UI_SURFACE)) {
    stubs[service] = {};
    for (const method of methods as readonly string[]) {
      if (isLocalMethod(service, method)) stubs[service][method] = local[service][method];
      else stubs[service][method] = isWatchName(method) ? watchStub(link, service, method) : callStub(link, service, method);
    }
  }
  return stubs as unknown as DataServices;
}

function watchStub(link: RemoteLink, service: string, method: string) {
  return (...args: unknown[]) => {
    const listener = args[args.length - 1] as RefusableListener<unknown>;
    return link.watch(service, method, args.slice(0, -1), listener, (error) => listener.onRefused?.(decodeError(error)));
  };
}

function callStub(link: RemoteLink, service: string, method: string) {
  return async (...args: unknown[]) => {
    const outcome = await link.call(service, method, args);
    if (outcome.ok) return outcome.value;
    throw decodeError(outcome.error);
  };
}
