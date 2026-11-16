/** Where the hub runs: the three-letter code of its Cloudflare data centre (`FRA`), or null where there is no hub or it could not tell. */
export interface HubPlace {
  code(): Promise<string | null>;
}

export const NO_HUB_PLACE: HubPlace = { code: () => Promise.resolve(null) };
