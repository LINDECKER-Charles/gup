import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPersistedInstallTimeout,
  INSTALL_SECTION,
} from "../../../src/core/config/install-section.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import {
  DEFAULT_INSTALL_TIMEOUT_S,
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../../../src/core/runner.js";

let file: string;
const initialTimeout = getInstallTimeoutSeconds();

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-install-section-")), "config.json");
});

afterEach(() => {
  setInstallTimeoutSeconds(initialTimeout);
});

async function storeWith(install: unknown): Promise<ConfigStore> {
  await writeFile(file, JSON.stringify({ version: 1, sections: { install } }), "utf8");
  return new ConfigStore({ file });
}

describe("INSTALL_SECTION", () => {
  it("defaults to the runner's own timeout", () => {
    expect(INSTALL_SECTION.defaults.timeoutSeconds).toBe(DEFAULT_INSTALL_TIMEOUT_S);
  });

  it("accepts 0 (no cap) up to one day, and nothing else", async () => {
    expect((await storeWith({ v: 1, timeoutSeconds: 0 })).read(INSTALL_SECTION)).toEqual({
      timeoutSeconds: 0,
    });
    const store = await storeWith({ v: 1, timeoutSeconds: 86_401 });
    expect(store.read(INSTALL_SECTION).timeoutSeconds).toBe(DEFAULT_INSTALL_TIMEOUT_S);
    expect(store.status().issues).toEqual([
      "install.timeoutSeconds : entier entre 0 et 86400 attendu",
    ]);
  });
});

describe("install timeout precedence: --timeout > GUP_INSTALL_TIMEOUT > file > default", () => {
  /** The install section as the file has it. */
  const persisted = async (install: unknown) => (await storeWith(install)).read(INSTALL_SECTION);

  it("applies the file's timeout when the environment says nothing", async () => {
    applyPersistedInstallTimeout(await persisted({ v: 1, timeoutSeconds: 600 }), {});
    expect(getInstallTimeoutSeconds()).toBe(600);
  });

  it("keeps the default without a file", () => {
    setInstallTimeoutSeconds(42);
    applyPersistedInstallTimeout(new ConfigStore({ file }).read(INSTALL_SECTION), {});
    expect(getInstallTimeoutSeconds()).toBe(DEFAULT_INSTALL_TIMEOUT_S);
  });

  it("lets GUP_INSTALL_TIMEOUT win over the file", async () => {
    setInstallTimeoutSeconds(90);
    applyPersistedInstallTimeout(await persisted({ v: 1, timeoutSeconds: 600 }), {
      GUP_INSTALL_TIMEOUT: "90",
    });
    expect(getInstallTimeoutSeconds()).toBe(90);
  });

  it("treats an empty GUP_INSTALL_TIMEOUT as unset, like the runner", async () => {
    applyPersistedInstallTimeout(await persisted({ v: 1, timeoutSeconds: 600 }), {
      GUP_INSTALL_TIMEOUT: "",
    });
    expect(getInstallTimeoutSeconds()).toBe(600);
  });

  it("lets the --timeout flag, applied by the action afterwards, win over both", async () => {
    applyPersistedInstallTimeout(await persisted({ v: 1, timeoutSeconds: 600 }), {});
    setInstallTimeoutSeconds(30);
    expect(getInstallTimeoutSeconds()).toBe(30);
  });
});
