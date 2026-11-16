/** The paths only the probe Worker answers, for the tests that run it; the deployed Worker never serves them. */

/** The path the hibernation test asks which construction of the hub it is talking to; only the probe Worker answers it. */
export const INSTANCE_PATH = '/api/instance';

/** The prefix under which the probe Worker sends a request to the former hub, so the move test can give it data before the new hub takes it. */
export const FORMER_HUB_PATH = '/api/former';
