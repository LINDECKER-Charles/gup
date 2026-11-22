/**
 * The admin's second factor, without the key ever reaching argv or a log:
 *
 *   npm run -s admin:totp -- secret
 *     prints a new ADMIN_TOTP_SECRET (20 random bytes, base32) and nothing
 *     else, to pipe straight into the vault or an env file;
 *
 *   printf '%s' "$ADMIN_TOTP_SECRET" | npm run -s admin:totp -- qr <file.svg> [account]
 *     writes the enrolment QR code of the key read on stdin, for the
 *     authenticator app to scan. The file holds the key: delete it once scanned.
 */
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { renderSVG } from "uqr";
import { Totp } from "../src/auth/totp.js";
import { base32Decode, base32Encode } from "../src/security/base32.js";

const SECRET_BYTES = 20;
const ISSUER = "gup feedback";
const DEFAULT_ACCOUNT = "admin";
const OWNER_ONLY = 0o600;
const EXIT_USAGE = 2;
const USAGE = [
  "usage: npm run -s admin:totp -- secret",
  "       printf '%s' \"$ADMIN_TOTP_SECRET\" | npm run -s admin:totp -- qr <file.svg> [account]",
].join("\n");

function fail(message: string): never {
  process.stderr.write(`admin:totp: ${message}\n`);
  process.exit(EXIT_USAGE);
}

/** Key URI format of Google Authenticator, read by every authenticator app. */
function otpauthUri(secret: string, account: string): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret, issuer: ISSUER, algorithm: "SHA1", digits: "6", period: "30",
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

async function writeQr(file: string | undefined, account: string): Promise<void> {
  if (file === undefined) fail(USAGE);
  const raw = (await text(process.stdin)).trim();
  let key: Buffer;
  try {
    key = base32Decode(raw);
  } catch {
    fail("stdin is not a base32 key");
  }
  if (key.length < Totp.minSecretBytes) fail(`the key needs ${Totp.minSecretBytes} bytes at least`);
  const svg = renderSVG(otpauthUri(base32Encode(key), account), { ecc: "M", border: 2 });
  await writeFile(file, svg, { mode: OWNER_ONLY });
  process.stderr.write(`admin:totp: QR code written to ${file}: scan it, then delete it.\n`);
}

const [command, ...args] = process.argv.slice(2);
if (command === "secret") {
  process.stdout.write(`${base32Encode(randomBytes(SECRET_BYTES))}\n`);
} else if (command === "qr") {
  await writeQr(args[0], args[1] ?? DEFAULT_ACCOUNT);
} else {
  fail(USAGE);
}
