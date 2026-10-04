import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NODE_FILE_OPS } from "../../../src/core/config/atomic-write.js";
import { MAX_CONFIG_BYTES } from "../../../src/core/config/config-file.js";
import { defineSection, type JsonObject } from "../../../src/core/config/section.js";
import { ConfigStore, ConfigWriteError } from "../../../src/core/config/store.js";

interface Prefs {
  readonly fast: boolean;
  readonly mode: "a" | "b";
  readonly count: number;
}

const PREFS = defineSection<Prefs>({
  key: "prefs",
  version: 1,
  defaults: { fast: false, mode: "a", count: 3 },
  parse: (read) => ({
    fast: read.boolean("fast", false),
    mode: read.oneOf("mode", ["a", "b"], "a"),
    count: read.integer("count", { min: 0, max: 10 }, 3),
  }),
});

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-config-"));
  file = join(dir, "nested", "config.json");
});

const onDisk = async (): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));

async function seed(content: unknown): Promise<void> {
  // Creates the directory; the defaults leave an empty document behind.
  new ConfigStore({ file }).write(PREFS, PREFS.defaults);
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content), "utf8");
}

describe("ConfigStore: reading", () => {
  it("serves the defaults when there is no file", () => {
    const store = new ConfigStore({ file });
    expect(store.read(PREFS)).toEqual({ fast: false, mode: "a", count: 3 });
    expect(store.status()).toMatchObject({ file, state: "missing", issues: [] });
  });

  it("falls back per field and reports what was wrong", async () => {
    await seed({ version: 1, sections: { prefs: { v: 1, fast: true, mode: "z", count: 99 } } });
    const store = new ConfigStore({ file });
    expect(store.read(PREFS)).toEqual({ fast: true, mode: "a", count: 3 });
    expect(store.status().issues).toEqual([
      "prefs.mode : une valeur parmi a, b attendue",
      "prefs.count : entier entre 0 et 10 attendu",
    ]);
  });

  it("accepts a file saved with a byte-order mark (Notepad)", async () => {
    await seed(`﻿${JSON.stringify({ version: 1, sections: { prefs: { fast: true } } })}`);
    expect(new ConfigStore({ file }).read(PREFS).fast).toBe(true);
  });

  it("upgrades an older section shape through migrate()", async () => {
    const migrate = vi.fn((raw: JsonObject): JsonObject => ({ ...raw, fast: raw["quick"] === "yes" }));
    const v2 = defineSection<Prefs>({ ...PREFS, version: 2, migrate });
    await seed({ version: 1, sections: { prefs: { v: 1, quick: "yes" } } });
    expect(new ConfigStore({ file }).read(v2).fast).toBe(true);
    expect(migrate).toHaveBeenCalledWith({ v: 1, quick: "yes" }, 1);
  });
});

describe("ConfigStore: writing", () => {
  it("round-trips a value and writes only what differs from the defaults", async () => {
    new ConfigStore({ file }).write(PREFS, { fast: true, mode: "a", count: 3 });
    expect(await onDisk()).toEqual({ version: 1, sections: { prefs: { v: 1, fast: true } } });
    expect(new ConfigStore({ file }).read(PREFS)).toEqual({ fast: true, mode: "a", count: 3 });
  });

  it("drops a section once it is back to its defaults", async () => {
    const store = new ConfigStore({ file });
    store.write(PREFS, { fast: true, mode: "b", count: 1 });
    store.reset(PREFS);
    expect(await onDisk()).toEqual({ version: 1, sections: {} });
    expect(store.read(PREFS)).toEqual(PREFS.defaults);
  });

  it("preserves unknown sections and the fields it does not know", async () => {
    await seed({
      version: 1,
      sections: { theme: { v: 1, id: "dark" }, prefs: { v: 1, future: [1, 2], count: 5 } },
    });
    new ConfigStore({ file }).write(PREFS, { fast: true, mode: "a", count: 3 });
    expect(await onDisk()).toEqual({
      version: 1,
      sections: { theme: { v: 1, id: "dark" }, prefs: { v: 1, future: [1, 2], fast: true } },
    });
  });

  it("keeps a section another process saved after this one loaded", async () => {
    const store = new ConfigStore({ file });
    store.read(PREFS);
    const other = defineSection({ ...PREFS, key: "other" });
    new ConfigStore({ file }).write(other, { fast: true, mode: "b", count: 3 });
    store.write(PREFS, { fast: false, mode: "a", count: 7 });
    expect(await onDisk()).toEqual({
      version: 1,
      sections: { other: { v: 1, fast: true, mode: "b" }, prefs: { v: 1, count: 7 } },
    });
  });

  it("never copies a prototype-polluting key back to disk", async () => {
    await seed('{"version":1,"sections":{"__proto__":{"x":1},"prefs":{"v":1,"__proto__":{"y":1}}}}');
    new ConfigStore({ file }).write(PREFS, { fast: true, mode: "a", count: 3 });
    expect(await readFile(file, "utf8")).not.toContain("__proto__");
  });

  it("notifies subscribers with the section key", () => {
    const store = new ConfigStore({ file });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.write(PREFS, { fast: true, mode: "a", count: 3 });
    unsubscribe();
    store.reset(PREFS);
    expect(listener.mock.calls).toEqual([["prefs"]]);
  });

  it.skipIf(process.platform === "win32")("keeps the file and its directory private", async () => {
    new ConfigStore({ file }).write(PREFS, { fast: true, mode: "a", count: 3 });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, "nested"))).mode & 0o777).toBe(0o700);
  });
});

describe("ConfigStore: update", () => {
  it("applies the change to the value on disk, not to a stale copy", () => {
    const store = new ConfigStore({ file });
    store.read(PREFS);
    new ConfigStore({ file }).write(PREFS, { fast: false, mode: "a", count: 5 });
    const stored = store.update(PREFS, (current) => ({ ...current, count: current.count + 1 }));
    expect(stored.count).toBe(6);
    expect(store.read(PREFS).count).toBe(6);
  });

  it("runs in memory when the store is disabled", () => {
    const store = new ConfigStore({ file, isDisabled: true });
    expect(store.update(PREFS, (current) => ({ ...current, fast: true })).fast).toBe(true);
    expect(store.read(PREFS).fast).toBe(true);
  });

  it("changes nothing when the section cannot be persisted", () => {
    const store = new ConfigStore({ file: null });
    expect(() => store.update(PREFS, (current) => ({ ...current, count: 9 }))).toThrow(ConfigWriteError);
    expect(store.read(PREFS).count).toBe(3);
  });
});

describe("ConfigStore: damaged and foreign files", () => {
  it("moves a corrupt file aside and starts from the defaults", async () => {
    await seed("{ not json");
    const now = () => new Date("2026-10-03T14:22:05.000Z");
    const store = new ConfigStore({ file, now });
    expect(store.read(PREFS)).toEqual(PREFS.defaults);
    const backup = join(dir, "nested", "config.corrupt-20261003T142205.json");
    expect(store.status()).toMatchObject({ state: "recovered", backup });
    expect(await readFile(backup, "utf8")).toBe("{ not json");
  });

  it("treats an oversized file as corrupt", async () => {
    await seed(" ".repeat(MAX_CONFIG_BYTES + 1));
    expect(new ConfigStore({ file }).status().state).toBe("recovered");
  });

  it("never writes over a file a newer gup owns", async () => {
    const newer = { version: 2, sections: { prefs: { v: 1, fast: true } } };
    await seed(newer);
    const store = new ConfigStore({ file });
    expect(store.read(PREFS).fast).toBe(true);
    expect(() => store.write(PREFS, { fast: false, mode: "b", count: 3 })).toThrow(
      expect.objectContaining({ failure: "read-only" }),
    );
    expect(await onDisk()).toEqual(newer);
    expect(store.status().readOnlySections).toEqual(["prefs"]);
    // The session still uses what the user chose.
    expect(store.read(PREFS).mode).toBe("b");
  });

  it("protects only the section a newer gup wrote", async () => {
    await seed({ version: 1, sections: { prefs: { v: 3, fast: true } } });
    const store = new ConfigStore({ file });
    const other = defineSection({ ...PREFS, key: "other" });
    expect(() => store.write(PREFS, PREFS.defaults)).toThrow(ConfigWriteError);
    store.write(other, { fast: true, mode: "a", count: 3 });
    expect(await onDisk()).toMatchObject({ sections: { prefs: { v: 3 }, other: { fast: true } } });
  });

  it("refuses to save over a file that became corrupt since it was loaded", async () => {
    const store = new ConfigStore({ file });
    store.write(PREFS, { fast: true, mode: "a", count: 3 });
    await writeFile(file, "garbage", "utf8");
    expect(() => store.write(PREFS, PREFS.defaults)).toThrow(
      expect.objectContaining({ failure: "changed-on-disk" }),
    );
    expect(await readFile(file, "utf8")).toBe("garbage");
  });

  it("reports an I/O failure and leaves the previous file intact", async () => {
    const store = new ConfigStore({ file });
    store.write(PREFS, { fast: true, mode: "a", count: 3 });
    const busy = (): never => {
      throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    };
    const failing = new ConfigStore({ file, fileOps: { ...NODE_FILE_OPS, renameSync: busy } });
    expect(() => failing.write(PREFS, PREFS.defaults)).toThrow(
      expect.objectContaining({ failure: "io" }),
    );
    expect(failing.status().lastWriteError).toBe("EBUSY");
    expect(await onDisk()).toEqual({ version: 1, sections: { prefs: { v: 1, fast: true } } });
    expect(await readdir(join(dir, "nested"))).toEqual(["config.json"]);
  });

  it("forgets a failed save once a later one persists", () => {
    let isBusy = true;
    const renameSync: typeof NODE_FILE_OPS.renameSync = (...args) => {
      if (isBusy) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
      NODE_FILE_OPS.renameSync(...args);
    };
    const store = new ConfigStore({ file, fileOps: { ...NODE_FILE_OPS, renameSync } });
    expect(() => store.write(PREFS, { fast: true, mode: "a", count: 3 })).toThrow();
    expect(store.status().lastWriteError).toBe("EBUSY");

    isBusy = false;
    store.update(PREFS, (current) => ({ ...current, count: 4 }));

    expect(store.status()).not.toHaveProperty("lastWriteError");
  });
});

describe("ConfigStore: without a file", () => {
  it("never touches the disk when disabled, and keeps values in memory", async () => {
    const store = new ConfigStore({ file, isDisabled: true });
    store.write(PREFS, { fast: true, mode: "a", count: 3 });
    expect(store.read(PREFS).fast).toBe(true);
    expect(store.status().state).toBe("disabled");
    expect(await readdir(dir)).toEqual([]);
  });

  it("runs in memory when the platform gives no location, and says so on write", () => {
    const store = new ConfigStore({ file: null });
    expect(() => store.write(PREFS, { fast: true, mode: "a", count: 3 })).toThrow(
      expect.objectContaining({ failure: "unavailable" }),
    );
    expect(store.read(PREFS).fast).toBe(true);
    expect(store.status()).toMatchObject({ file: null, state: "unavailable" });
  });
});

describe("configStore()", () => {
  it("is disabled by GUP_CONFIG=0 and shared by the whole process", async () => {
    vi.resetModules();
    vi.stubEnv("GUP_CONFIG", "0");
    try {
      const { configStore } = await import("../../../src/core/config/store.js");
      expect(configStore().status().state).toBe("disabled");
      expect(configStore()).toBe(configStore());
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
