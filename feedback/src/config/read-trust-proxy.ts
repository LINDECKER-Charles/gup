import { isIP } from "node:net";
import type { AppConfig } from "./app-config.js";
import type { EnvReader } from "./env-reader.js";

/** The edge proxy reaches the app over a private Docker network. */
const DEFAULT_TRUST_PROXY = "loopback,uniquelocal";
/** The named ranges Fastify's `proxy-addr` understands. */
const NAMED_RANGES = ["loopback", "linklocal", "uniquelocal"];
const PREFIX_BITS: Readonly<Record<number, number>> = { 4: 32, 6: 128 };
const PREFIX_PATTERN = /^\d{1,3}$/;

/** A named range, an address, or an address with a prefix length (`10.0.0.0/8`). */
function isProxyEntry(entry: string): boolean {
  if (NAMED_RANGES.includes(entry)) return true;
  const [address = "", prefix, ...extra] = entry.split("/");
  const maxBits = PREFIX_BITS[isIP(address)];
  if (maxBits === undefined || extra.length > 0) return false;
  return prefix === undefined || (PREFIX_PATTERN.test(prefix) && Number(prefix) <= maxBits);
}

/**
 * Fastify `trustProxy`: `true`, `false`, or the peers allowed to set
 * `X-Forwarded-For`. A typo must fail the start: a silently ignored entry
 * would rate-limit every visitor as the proxy's single address.
 */
export function readTrustProxy(reader: EnvReader): AppConfig["trustProxy"] {
  const raw = reader.optional("TRUST_PROXY") ?? DEFAULT_TRUST_PROXY;
  if (raw === "true" || raw === "false") return raw === "true";
  const entries = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (entries.length === 0 || !entries.every(isProxyEntry)) {
    reader.reject("TRUST_PROXY", "must be true, false, or a comma-separated list of "
      + "addresses, CIDR ranges, loopback, linklocal or uniquelocal");
  }
  return entries;
}
