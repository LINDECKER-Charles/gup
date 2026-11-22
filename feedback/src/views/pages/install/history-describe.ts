import type { StoredHistoryRecord } from "../../../ports/install-reader.js";
import { countOf } from "../../text/count-of.js";
import { formatDuration } from "../../text/format-duration.js";

/** A history record in words: what it is about, its facts, what went wrong. */
export interface HistoryDescription {
  readonly subject: string;
  readonly facts: readonly string[];
  /** The failure cause or skip reason; a scan's provider errors. */
  readonly message: string | null;
}

type Data = StoredHistoryRecord["data"];

const SOURCE_NOUN = { one: "source", many: "sources" };
const OUTDATED_NOUN = { one: "paquet en retard", many: "paquets en retard" };
const UNKNOWN = "?";

function text(data: Data, name: string): string | null {
  const value = data[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function duration(data: Data): string | null {
  const value = data["durationMs"];
  return typeof value === "number" ? formatDuration(value) : null;
}

function present(values: readonly (string | null)[]): string[] {
  return values.filter((value) => value !== null);
}

function describeUpdate(data: Data): HistoryDescription {
  const from = text(data, "from");
  const to = text(data, "to");
  const versions = from === null && to === null ? null : `${from ?? UNKNOWN} → ${to ?? UNKNOWN}`;
  return {
    subject: `${text(data, "providerId") ?? UNKNOWN} · ${text(data, "packageId") ?? UNKNOWN}`,
    facts: present([
      versions,
      duration(data),
      data["elevated"] === true ? "élevée" : null,
      text(data, "retry") === null ? null : `nouvel essai (${text(data, "retry")})`,
    ]),
    message: text(data, "message"),
  };
}

/** `winget : timeout` for each provider whose scan failed. */
function providerErrors(providers: readonly unknown[]): string[] {
  return providers.flatMap((provider) => {
    if (typeof provider !== "object" || provider === null) return [];
    const { providerId, error } = provider as Record<string, unknown>;
    return typeof error === "string" ? [`${String(providerId ?? UNKNOWN)} : ${error}`] : [];
  });
}

function describeScan(data: Data): HistoryDescription {
  const providers = Array.isArray(data["providers"]) ? data["providers"] : [];
  const errors = providerErrors(providers);
  const outdated = data["outdated"];
  return {
    subject: countOf(providers.length, SOURCE_NOUN),
    facts: present([
      typeof outdated === "number" ? countOf(outdated, OUTDATED_NOUN) : null,
      duration(data),
      data["fast"] === true ? "rapide" : null,
    ]),
    message: errors.length === 0 ? null : errors.join(" ; "),
  };
}

export function describeHistory(record: StoredHistoryRecord): HistoryDescription {
  return record.kind === "scan" ? describeScan(record.data) : describeUpdate(record.data);
}
