/** The single home for deployment and behaviour settings. */

/** SHA-256 of "teach-2468", the development password. For the local dev server only. */
const DEV_PASSWORD_SHA256 = 'bfe3ee1676b57a46eca785d10b7b9448be13a88ec5842042f730da4650a8b36a';

/** The development authenticator key (base32). For the local dev server only. */
const DEV_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/**
 * Deployed builds take the password hash and the authenticator key from the
 * `ADMIN_PASSWORD` and `ADMIN_TOTP_SECRET` GitHub secrets (see docs/PLAN.md).
 * A build without them has no admin access rather than a default one.
 */
export const ADMIN_PASSWORD_SHA256: string | undefined =
  import.meta.env.VITE_ADMIN_PASSWORD_SHA256 || (import.meta.env.DEV ? DEV_PASSWORD_SHA256 : undefined);

export const ADMIN_TOTP_SECRET: string | undefined =
  import.meta.env.VITE_ADMIN_TOTP_SECRET || (import.meta.env.DEV ? DEV_TOTP_SECRET : undefined);

export const STORAGE_NAMESPACE = 'pearls';
