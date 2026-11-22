import { timingSafeEqual } from "node:crypto";
import { sha256 } from "./sha256.js";

/**
 * Compares two secrets without leaking, through timing, where they differ or
 * how long the expected one is: both sides are hashed to a fixed length first,
 * because `timingSafeEqual` itself throws on a length mismatch.
 */
export function constantTimeEqual(actual: string | Buffer, expected: string | Buffer): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected));
}
