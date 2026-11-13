import { HUB_NAME } from './hubName';

export { SchoolHub } from './SchoolHub';

/**
 * The Worker's entry. The site's files are served by the platform's assets; only `/api/*` reaches this code
 * (see `run_worker_first` in wrangler.jsonc), and all of it goes to the one hub.
 */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.HUB.getByName(HUB_NAME).fetch(request);
  },
} satisfies ExportedHandler<Env>;
