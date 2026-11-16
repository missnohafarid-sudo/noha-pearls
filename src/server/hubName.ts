/** There is exactly one hub; every request is addressed to it by this name. */
export const HUB_NAME = 'school';

export const theHub = (hubs: Env['HUB']) => hubs.getByName(HUB_NAME);
