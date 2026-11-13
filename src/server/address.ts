import { attemptKeyOf } from '../domain/adminAccess';

/** The address used when a request names none, as on this computer. */
export const LOCAL_ADDRESS = 'local';
const ADDRESS_HEADER = 'CF-Connecting-IP';

/** The network address a request came from, as the hub counts it: one key for a whole IPv6 /64, so rotating inside it escapes nothing. */
export const addressOf = (request: Request): string => attemptKeyOf(request.headers.get(ADDRESS_HEADER) ?? LOCAL_ADDRESS);
