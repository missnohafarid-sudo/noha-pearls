// Prints an authenticator setup for the admin account: the key, the otpauth
// link and a QR code. No argument makes a new key; one argument reuses it.
import qrcode from 'qrcode-generator';
import { generateTotpSecret, isTotpSecret, otpauthUri } from '../src/infrastructure/totp.ts';

const ACCOUNT = 'admin';
const ISSUER = "Noha's Pearls";

const secret = process.argv[2]?.toUpperCase() ?? generateTotpSecret();
if (!isTotpSecret(secret)) {
  console.error('That is not a valid base32 authenticator key.');
  process.exit(1);
}

const uri = otpauthUri(secret, ACCOUNT, ISSUER);
const qr = qrcode(0, 'M');
qr.addData(uri);
qr.make();

console.log(`Secret: ${secret}\n`);
console.log(`Link:   ${uri}\n`);
console.log(qr.createASCII(2, 2));
console.log('Every teacher scans this QR code once in an authenticator app.');
console.log('Store the secret as the ADMIN_TOTP_SECRET repository secret.');
console.log('Keep a printed copy of the secret somewhere safe.');
