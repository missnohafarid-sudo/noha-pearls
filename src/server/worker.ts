import { answerApi } from './gateway';
import { HUB_NAME } from './hubName';

export { SchoolHub } from './SchoolHub';

/**
 * The Worker's entry. The site's files are served by the platform's assets; only `/api/*` reaches this code
 * (see `run_worker_first` in wrangler.jsonc). It answers what it can alone; the rest goes to the one hub.
 */
export default {
  fetch: (request: Request, env: Env): Promise<Response> => answerApi(request, (forwarded) => env.HUB.getByName(HUB_NAME).fetch(forwarded), (error) => console.error(error)),
} satisfies ExportedHandler<Env>;
