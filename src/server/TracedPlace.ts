import type { HubPlace } from '../ports/hubPlace';
import { PLACE_ASK_MS } from '../ports/limits';
import type { PlatformKv } from './platformKv';

/** Cloudflare's own page that says, among other things, which data centre answered: asked from the hub, the one it runs in. */
const TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';
/** Kept in the platform's key-value store, which the hub's tables never hold, so a hub that moved does not carry the old place. */
const PLACE_KEY = 'hub-place';

/** The data centre a trace names on its `colo=` line. */
export const coloOf = (trace: string): string | null => /^colo=([A-Z]{3})$/m.exec(trace)?.[1] ?? null;

const traceText = async (url: string): Promise<string> => (await fetch(url, { signal: AbortSignal.timeout(PLACE_ASK_MS) })).text();

/**
 * Where the hub runs, as Cloudflare last said. The hub asks again each time it is built (`refresh`), without waiting for the
 * answer, so no command ever waits on the network; until a first answer arrives there is no place to show.
 */
export class TracedPlace implements HubPlace {
  constructor(
    private readonly kv: PlatformKv,
    private readonly fetchText: (url: string) => Promise<string> = traceText,
  ) {}

  code(): Promise<string | null> {
    return Promise.resolve(this.kv.get<string>(PLACE_KEY) ?? null);
  }

  /** Asks Cloudflare where the hub runs and keeps the answer; an ask that fails or takes too long keeps the place known before. */
  async refresh(): Promise<void> {
    const code = coloOf(await this.fetchText(TRACE_URL).catch(() => ''));
    if (code !== null) this.kv.put(PLACE_KEY, code);
  }
}
