/**
 * Prints the ADMIN_PASSWORD_HASH of the password read on stdin, and nothing
 * else, so it pipes straight into an env file:
 *
 *   printf '%s' "$PASSWORD" | npm run -s admin:hash
 *
 * The password never goes through argv (process listings, shell history).
 */
import { text } from "node:stream/consumers";
import { PasswordHash } from "../src/security/password-hash.js";

const TRAILING_NEWLINE = /\r?\n$/;
const EXIT_USAGE = 2;

const password = (await text(process.stdin)).replace(TRAILING_NEWLINE, "");
if (password === "") {
  process.stderr.write("admin:hash: pipe the password on stdin.\n");
  process.exit(EXIT_USAGE);
}
process.stdout.write(`${(await PasswordHash.create(password)).toString()}\n`);
