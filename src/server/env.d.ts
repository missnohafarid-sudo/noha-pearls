/** The secrets a deployed Worker is given; `wrangler types` does not know them. A hub without them refuses every sign-in. */
interface Env {
  ADMIN_PASSWORD?: string;
  ADMIN_TOTP_SECRET?: string;
}
