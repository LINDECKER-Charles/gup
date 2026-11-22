import { FIELD_RULES } from "./field-rules.js";

function readStartedAt(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A filled honeypot, or a form submitted less than three seconds after it was
 * rendered. `startedAt` comes from the visitor's clock: a value in the future
 * (a clock running ahead) proves nothing and is not held against them —
 * otherwise a fast clock would silently swallow genuine reports.
 */
export function isLikelyBot(body: unknown, now: Date): boolean {
  if (typeof body !== "object" || body === null) return false;
  const fields = body as Record<string, unknown>;
  const honeypot = fields["website"];
  if (honeypot !== undefined && honeypot !== null && honeypot !== "") return true;
  const startedAt = readStartedAt(fields["startedAt"]);
  if (startedAt === null) return false;
  const ageMs = now.getTime() - startedAt;
  return ageMs >= 0 && ageMs < FIELD_RULES.minimumFillMs;
}
