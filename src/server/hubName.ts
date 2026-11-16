/** Every request is addressed to the hub by this name; the former hub only gives its data to it once (`HubMove`). */
export const HUB_NAME = 'school-middle-east';

/**
 * Where the hub was asked to be made, on its first start: as near the Middle East as Durable Objects run (the school is in Qatar;
 * Cloudflare runs none in the region itself and picks the nearest place that does). A hint counts only when the hub is made.
 */
const HUB_LOCATION: DurableObjectLocationHint = 'me';

/** The hub before it moved nearer the school. The new hub takes all its data from it once; after that it answers nothing. */
const FORMER_HUB_NAME = 'school';

export const theHub = (hubs: Env['HUB']) => hubs.getByName(HUB_NAME, { locationHint: HUB_LOCATION });

export const formerHub = (hubs: Env['HUB']) => hubs.getByName(FORMER_HUB_NAME);
