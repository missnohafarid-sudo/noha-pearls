import type { HubPlace } from '../ports/hubPlace';
import type { PlatformKv } from './platformKv';

/** Cloudflare's own page that says, among other things, which data centre answered: asked from the hub, the one it runs in. */
const TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';
/** Kept in the platform's key-value store, which the hub's tables never hold, so a hub that moved does not carry the old place. */
const PLACE_KEY = 'hub-place';

/** The data centre a trace names on its `colo=` line. */
export const coloOf = (trace: string): string | null => /^colo=([A-Z]{3})$/m.exec(trace)?.[1] ?? null;

/** Asks Cloudflare once where the hub runs, and keeps the answer: a hub never moves. A failed ask is tried again next time. */
export class TracedPlace implements HubPlace {
  private asking: Promise<string | null> | null = null;

  constructor(
    private readonly kv: PlatformKv,
    private readonly fetchText: (url: string) => Promise<string> = async (url) => (await fetch(url)).text(),
  ) {}

  code(): Promise<string | null> {
    const known = this.kv.get<string>(PLACE_KEY);
    if (known !== undefined) return Promise.resolve(known);
    this.asking ??= this.ask();
    return this.asking;
  }

  private async ask(): Promise<string | null> {
    const code = coloOf(await this.fetchText(TRACE_URL).catch(() => ''));
    if (code === null) this.asking = null;
    else this.kv.put(PLACE_KEY, code);
    return code;
  }
}
