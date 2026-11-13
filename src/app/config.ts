/** The single home for deployment and behaviour settings. */

/** SHA-256 of "teach-2468", the development password. Public, like the key below. */
const DEV_PASSWORD_SHA256 = 'bfe3ee1676b57a46eca785d10b7b9448be13a88ec5842042f730da4650a8b36a';

/** The development authenticator key (base32). */
const DEV_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/**
 * The prototype sign-in of the browser-only mode (see `SITE_ONLY`) takes the public development pair and nothing else, so that
 * no build of the page can ever carry a real secret. The real secrets live only on the hub (`ADMIN_PASSWORD` and
 * `ADMIN_TOTP_SECRET` in the Worker's environment); the page never reads them from any build variable.
 */
export const ADMIN_PASSWORD_SHA256: string = DEV_PASSWORD_SHA256;
export const ADMIN_TOTP_SECRET: string = DEV_TOTP_SECRET;

export const STORAGE_NAMESPACE = 'pearls';

/**
 * Set by the walkthrough's build (`NOHA_SITE_ONLY=1`, and nothing else counts as on): the page then keeps its data in the browser
 * and holds the prototype sign-in, as before the hub existed. Every other build and `npm run dev` ask the hub. The only place the
 * page reads this switch.
 */
export const SITE_ONLY: boolean = import.meta.env.NOHA_SITE_ONLY === '1';
