import { withApiHeaders } from '../apiHeaders';
import { SchoolHub } from '../SchoolHub';
import { formerHub, theHub } from '../hubName';
import { FORMER_HUB_PATH, INSTANCE_PATH } from './probePaths';

/** Only the hibernation and move tests run this Worker (its configuration is e2e/probe/wrangler.jsonc); the deployed Worker never imports it. */

/** The real hub, with one addition: it can say which construction of itself answers, so a test can tell that it was built again. */
export class ProbedHub extends SchoolHub {
  private readonly instance = crypto.randomUUID();

  override async fetch(request: Request): Promise<Response> {
    return new URL(request.url).pathname === INSTANCE_PATH ? Response.json({ instance: this.instance }) : super.fetch(request);
  }
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${FORMER_HUB_PATH}/`)) return withApiHeaders(await theHub(env.HUB).fetch(request));
    url.pathname = url.pathname.slice(FORMER_HUB_PATH.length);
    return withApiHeaders(await formerHub(env.HUB).fetch(new Request(url, request)));
  },
} satisfies ExportedHandler<Env>;
