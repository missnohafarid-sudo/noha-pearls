import { isHeldToLimits } from '../domain/abuse';
import { readMeta, writeMeta } from '../infrastructure/sql/schema';
import { ADDRESS_NEW_TOKENS } from '../ports/limits';
import type { SqlDatabase } from '../ports/sql';
import { KeyedWindows } from './KeyedWindows';
import { constantTimeEqual, hmacHex, hmacKey, randomToken, sha256 } from './webCrypto';

const TOKEN_SHAPE = /^([A-Za-z0-9_-]{43})\.[0-9a-f]{64}$/;
const KEY_META = 'device-token-key';

/**
 * The device cookies the hub itself made. A token is a random part and a signature over it that only the hub can make, so a
 * token the hub did not issue (made up, cut short, unsigned, or signed with another key) is not a device.
 * Issuing is counted per address (a school's worth an hour), so that one address cannot make itself endless new devices.
 * The teacher is never counted nor refused: she must be able to use a new device whatever the school's other devices have used.
 */
export class DeviceTokens {
  private readonly issued: KeyedWindows;

  private constructor(
    private readonly key: CryptoKey,
    now: () => number,
  ) {
    this.issued = new KeyedWindows(ADDRESS_NEW_TOKENS, now);
  }

  /**
   * The key is a random one made once and kept in the database's `meta` table, whatever the admin secrets are: replacing a secret
   * must not unseat students, and a student's cookie must not be something a password can be tried against. The table must exist already.
   */
  static async from(db: SqlDatabase, now: () => number): Promise<DeviceTokens> {
    return new DeviceTokens(await hmacKey(await sha256(`noha-pearls/device-token/v1\u0000${DeviceTokens.storedKey(db)}`)), now);
  }

  private static storedKey(db: SqlDatabase): string {
    const known = readMeta(db, KEY_META);
    if (known !== null) return known;
    const made = randomToken();
    writeMeta(db, KEY_META, made);
    return made;
  }

  /** A new device's token; null when this address has been given too many lately (the teacher's device is always given one). */
  async issue(address: string, isAdmin = false): Promise<string | null> {
    if (isHeldToLimits(isAdmin)) {
      if (!this.issued.hasRoom(address)) return null;
      this.issued.record(address);
    }
    const random = randomToken();
    return `${random}.${await this.signatureOf(random)}`;
  }

  /** Forgets the addresses that have been given none lately. */
  prune(): void {
    this.issued.prune();
  }

  /** The token itself if the hub issued it; null for a missing value, a malformed one, or a wrong signature. */
  async verified(value: string | undefined): Promise<string | null> {
    const match = TOKEN_SHAPE.exec(value ?? '');
    if (!value || !match) return null;
    const signature = value.slice(match[1].length + 1);
    return (await constantTimeEqual(signature, await this.signatureOf(match[1]))) ? value : null;
  }

  private signatureOf(random: string): Promise<string> {
    return hmacHex(this.key, `device:${random}`);
  }
}
