import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_CONFIG_BYTES } from "../../../src/core/config/config-file.js";
import { defineSection } from "../../../src/core/config/section.js";
import { ConfigStore } from "../../../src/core/config/store.js";

// A store holding records (the scheduler's schedules) sizes its file bound
// to its own limits instead of a settings file's.

const NOTE = defineSection<{ readonly text: string }>({
  key: "note",
  version: 1,
  defaults: { text: "" },
  parse: (read) => ({ text: read.text("text", { maxLength: 2 * MAX_CONFIG_BYTES }) ?? "" }),
});

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-config-size-"));
  file = join(dir, "records.json");
  const text = "x".repeat(MAX_CONFIG_BYTES);
  await writeFile(file, JSON.stringify({ version: 1, sections: { note: { v: 1, text } } }));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ConfigStore maxBytes", () => {
  it("accepts a file above the settings bound when the store allows it", () => {
    const store = new ConfigStore({ file, maxBytes: 4 * MAX_CONFIG_BYTES });
    expect(store.read(NOTE).text).toHaveLength(MAX_CONFIG_BYTES);
    expect(store.status().state).toBe("loaded");
    store.update(NOTE, (current) => ({ text: `${current.text}y` }));
    expect(new ConfigStore({ file, maxBytes: 4 * MAX_CONFIG_BYTES }).read(NOTE).text).toHaveLength(
      MAX_CONFIG_BYTES + 1,
    );
  });

  it("keeps the settings bound by default", () => {
    expect(new ConfigStore({ file }).status().state).toBe("recovered");
  });
});
