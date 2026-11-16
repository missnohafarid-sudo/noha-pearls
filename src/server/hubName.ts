/** There is exactly one hub; every request is addressed to it by this name. */
export const HUB_NAME = 'school-middle-east';

/**
 * Where the hub was asked to be made, on its first start: as near the Middle East as Durable Objects run (the school is in Qatar;
 * Cloudflare runs none in the region itself and picks the nearest place that does). A hint counts only when the hub is made.
 */
const HUB_LOCATION = 'me';

/** What the platform's namespace of hubs offers: the hub by its name, made where the hint says when it does not exist yet. */
interface Hubs<Hub> {
  getByName(name: string, options?: { locationHint?: typeof HUB_LOCATION }): Hub;
}

export const theHub = <Hub>(hubs: Hubs<Hub>): Hub => hubs.getByName(HUB_NAME, { locationHint: HUB_LOCATION });
