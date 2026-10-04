import { describe, expect, it } from "vitest";
import type { ConfigStatus } from "../../../src/core/config/store.js";
import { describeConfigStatus } from "../../../src/ui/settings/config-status.js";
import {
  CONFIG_STATE_LABELS,
  startupIssueLine,
} from "../../../src/ui/text/settings/settings-labels.js";
import { useLocale } from "../../support/locale.js";

const status = (overrides: Partial<ConfigStatus>): ConfigStatus => ({
  file: "C:\\Users\\u\\AppData\\Roaming\\gup\\config.json",
  state: "loaded",
  issues: [],
  readOnlySections: [],
  ...overrides,
});

describe("describeConfigStatus", () => {
  it("says the file is saved, or that defaults apply without one", () => {
    expect(describeConfigStatus(status({}))).toEqual({
      text: CONFIG_STATE_LABELS.saved,
      level: "ok",
    });
    expect(describeConfigStatus(status({ state: "missing" }))).toEqual({
      text: CONFIG_STATE_LABELS.defaults,
      level: "ok",
    });
  });

  it("is off when GUP_CONFIG disables the file", () => {
    expect(describeConfigStatus(status({ state: "disabled", file: null }))).toEqual({
      text: CONFIG_STATE_LABELS.disabled,
      level: "off",
    });
  });

  it("warns about every state that loses settings", () => {
    const warned = [
      status({ state: "unavailable" }),
      status({ state: "recovered", backup: "config.corrupt-20261003T101500.json" }),
      status({ readOnlySections: ["theme"] }),
      status({ lastWriteError: "EPERM: operation not permitted" }),
      status({ issues: ["interface.mouse : booléen attendu"] }),
    ].map(describeConfigStatus);
    expect(warned.map((line) => line.level)).toEqual(["warn", "warn", "warn", "warn", "warn"]);
    expect(warned[1]?.text).toContain("config.corrupt-20261003T101500.json");
    expect(warned[3]?.text).toBe(CONFIG_STATE_LABELS.notSaved("EPERM: operation not permitted"));
    expect(warned[4]?.text).toContain("1 réglage(s) invalide(s) ignoré(s)");
  });
});

describe("describeConfigStatus in English", () => {
  useLocale("en");

  it("counts the invalid settings and lists them, each naming its field", () => {
    const issues = ["interface.mouse: expected a boolean", "scan.fast: expected a boolean"];
    expect(describeConfigStatus(status({ issues })).text).toBe(
      "‼ 2 invalid settings ignored: interface.mouse: expected a boolean; " +
        "scan.fast: expected a boolean",
    );
    expect(describeConfigStatus(status({ state: "missing" })).text).toBe("defaults (no file)");
    expect(startupIssueLine(issues[0] ?? "")).toBe(
      "gup: configuration — interface.mouse: expected a boolean",
    );
  });
});
