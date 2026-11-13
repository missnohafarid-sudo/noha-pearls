import { withApiHeaders } from '../apiHeaders';
import { SchoolHub } from '../SchoolHub';
import { HUB_NAME } from '../hubName';
import { INSTANCE_PATH } from './instancePath';

/** Only the hibernation test runs this Worker (its configuration is e2e/probe/wrangler.jsonc); the deployed Worker never imports it. */

/** The real hub, with one addition: it can say which construction of itself answers, so a test can tell that it was built again. */
export class ProbedHub extends SchoolHub {
  private readonly instance = crypto.randomUUID();

  override async fetch(request: Request): Promise<Response> {
    return new URL(request.url).pathname === INSTANCE_PATH ? Response.json({ instance: this.instance }) : super.fetch(request);
  }
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => withApiHeaders(await env.HUB.getByName(HUB_NAME).fetch(request)),
} satisfies ExportedHandler<Env>;
