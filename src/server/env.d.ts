/** The secrets a deployed Worker is given; `wrangler types` does not know them. A hub without them refuses every sign-in. */
interface Env {
  ADMIN_PASSWORD?: string;
  ADMIN_TOTP_SECRET?: string;
  /** '1' on this computer only: the hub then starts with a sample school (`src/server/sampleSchool.ts`). */
  SAMPLE_SCHOOL?: string;
}
