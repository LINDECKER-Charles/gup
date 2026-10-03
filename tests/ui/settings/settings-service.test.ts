import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileOps } from "../../../src/core/config/atomic-write.js";
import { NODE_FILE_OPS } from "../../../src/core/config/atomic-write.js";
import { ConfigStore, ConfigWriteError } from "../../../src/core/config/store.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-settings-")), "config.json");
});

const onDisk = async (): Promise<{ sections: Record<string, unknown> }> =>
  JSON.parse(await readFile(file, "utf8"));

/** File operations whose rename always fails, as with a locked file on Windows. */
const LOCKED_DISK: FileOps = {
  ...NODE_FILE_OPS,
  renameSync: () => {
    throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
  },
};

describe("SettingsService", () => {
  it("merges a patch into its section, persists it and tells subscribers", async () => {
    const settings = new SettingsService(new ConfigStore({ file }));
    const heard = vi.fn();
    settings.subscribe(heard);
    settings.update("interface", { mouse: false });
    expect(settings.get("interface")).toMatchObject({ mouse: false, animations: true });
    expect((await onDisk()).sections).toEqual({ interface: { v: 1, mouse: false } });
    expect(heard).toHaveBeenCalledWith("interface");
  });

  it("keeps a value it could not save in effect, and rethrows the failure", () => {
    const settings = new SettingsService(new ConfigStore({ file, fileOps: LOCKED_DISK }));
    expect(() => settings.update("theme", { id: "dark" })).toThrow(ConfigWriteError);
    expect(settings.get("theme").id).toBe("dark");
    expect(settings.status().lastWriteError).toContain("EPERM");
  });

  it("resets only the sections it is given", async () => {
    const settings = new SettingsService(new ConfigStore({ file }));
    settings.update("theme", { id: "light" });
    settings.update("scan", { fast: true });
    settings.reset(["theme"]);
    expect(settings.get("theme").id).toBe("terminal");
    expect(settings.get("scan").fast).toBe(true);
    expect((await onDisk()).sections).toEqual({ scan: { v: 1, fast: true } });
  });

  it("reports the issues of every section it knows, read or not", async () => {
    await writeFile(
      file,
      JSON.stringify({ version: 1, sections: { interface: { v: 1, mouse: 3 }, scan: { v: 1, fast: 1 } } }),
      "utf8",
    );
    const settings = new SettingsService(new ConfigStore({ file }));
    expect(settings.status().issues).toEqual([
      "interface.mouse : booléen attendu",
      "scan.fast : booléen attendu",
    ]);
  });

  it("does not hear about sections other features own", () => {
    const store = new ConfigStore({ file, isDisabled: true });
    const settings = new SettingsService(store);
    const heard = vi.fn();
    settings.subscribe(heard);
    store.reset({ key: "scheduler", version: 1, defaults: {}, parse: () => ({}) });
    expect(heard).not.toHaveBeenCalled();
  });
});
