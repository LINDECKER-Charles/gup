import { vi } from "vitest";
import { fixtureFile, type FixtureRef } from "./refs.js";

/** Inline text, or a reference to a recorded fixture file. */
export type Text = string | FixtureRef;

// Fixtures never change during a run, and a fault sweep reloads the same case
// dozens of times: read each file once per worker.
const cache = new Map<string, Promise<string>>();

async function readFixture(ref: FixtureRef): Promise<string> {
  // The real fs: in the providers project, node:fs/promises is the fake
  // machine's, which knows nothing of the repository.
  const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return fs.readFile(fixtureFile(ref), "utf8");
}

/** The text itself, or the content of the fixture it references. */
export async function resolveText(text: Text): Promise<string> {
  if (typeof text === "string") return text;
  const cached = cache.get(text.path);
  if (cached) return cached;
  const pending = readFixture(text);
  cache.set(text.path, pending);
  return pending;
}
