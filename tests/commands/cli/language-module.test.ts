import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyStartupLocale,
  createLanguageModule,
  languageCommand,
  type LanguageModuleDeps,
} from "../../../src/commands/cli/language-module.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import { ADMIN_BATCH_COMMAND } from "../../../src/core/elevation.js";
import { activeLocale } from "../../../src/core/i18n/locale.js";
import { resolveLocale } from "../../../src/core/i18n/resolve-locale.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { useLocale } from "../../support/locale.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const tempDir = useTempDirs();
let file: string;

beforeEach(async () => {
  file = join(await tempDir("gup-language-"), "config.json");
});

interface Run {
  readonly deps: LanguageModuleDeps;
  readonly out: string[];
  readonly err: string[];
}

function run(env: NodeJS.ProcessEnv = {}, settings = new SettingsService(new ConfigStore({ file }))): Run {
  const out: string[] = [];
  const err: string[] = [];
  const deps: LanguageModuleDeps = {
    settings: () => settings,
    env,
    write: (text) => out.push(text),
    writeError: (text) => err.push(text),
  };
  return { deps, out, err };
}

async function savedSections(): Promise<unknown> {
  return (JSON.parse(await readFile(file, "utf8")) as { sections: unknown }).sections;
}

describe("resolveLocale", () => {
  it("speaks English when nothing says otherwise", () => {
    expect(resolveLocale({ env: {} })).toEqual({ locale: "en", source: "default" });
  });

  it("takes GUP_LANG over the setting, and the setting over the default", () => {
    expect(resolveLocale({ env: { GUP_LANG: "fr_FR.UTF-8" }, setting: () => "en" })).toEqual({
      locale: "fr",
      source: "env",
    });
    expect(resolveLocale({ env: {}, setting: () => "fr" })).toEqual({
      locale: "fr",
      source: "setting",
    });
  });

  it("ignores a GUP_LANG it has no translation for, and says which", () => {
    expect(resolveLocale({ env: { GUP_LANG: " de " }, setting: () => "fr" })).toEqual({
      locale: "fr",
      source: "setting",
      ignoredEnv: "de",
    });
  });

  it("never asks for the setting when GUP_LANG decides", () => {
    const setting = (): never => {
      throw new Error("settings read");
    };
    expect(resolveLocale({ env: { GUP_LANG: "en" }, setting }).locale).toBe("en");
  });
});

describe("applyStartupLocale", () => {
  useLocale("fr");

  it("speaks the saved language from startup on", async () => {
    await writeFile(file, JSON.stringify({ version: 1, sections: { interface: { v: 1, language: "en" } } }));
    applyStartupLocale(["node", "gup", "list"], run().deps);
    expect(activeLocale()).toBe("en");
  });

  it("never reads the settings in the elevated child, which hears GUP_LANG only", () => {
    const settings = (): never => {
      throw new Error("the elevated child read the user's settings");
    };
    applyStartupLocale(["node", "gup", ADMIN_BATCH_COMMAND, "batch.json"], { settings, env: {} });
    expect(activeLocale()).toBe("en");
  });
});

describe("gup language", () => {
  useLocale("en");

  it("says which language it speaks, where that comes from, and how to change it", () => {
    const { deps, out } = run();
    expect(languageCommand(undefined, deps)).toBe(0);
    expect(out.join("")).toBe(
      "Language: English (default)\n" +
        "Available: en (English), fr (Français)\n" +
        "Change it: gup language <code>\n",
    );
  });

  it("saves the language, then confirms in it", async () => {
    const { deps, out, err } = run();
    expect(languageCommand("FR", deps)).toBe(0);
    expect(await savedSections()).toEqual({ interface: { v: 1, language: "fr" } });
    expect(activeLocale()).toBe("fr");
    expect(out.join("")).toBe("gup parle désormais français.\n");
    expect(err).toEqual([]);
  });

  it("warns when this shell's GUP_LANG keeps deciding over the saved language", () => {
    const { deps, err } = run({ GUP_LANG: "en" });
    expect(languageCommand("fr", deps)).toBe(0);
    expect(err.join("")).toContain("GUP_LANG=en est défini dans ce shell");
  });

  it("refuses a language it does not speak, as a usage error", () => {
    const { deps, out, err } = run();
    expect(languageCommand("de", deps)).toBe(2);
    expect(out).toEqual([]);
    expect(err.join("")).toContain('unknown language "de": choose en, fr');
  });

  it("fails when the language cannot be saved", () => {
    const readOnly = new SettingsService(new ConfigStore({ file: null }));
    const { deps, err } = run({}, readOnly);
    expect(languageCommand("fr", deps)).toBe(1);
    expect(err.join("")).toContain("the language could not be saved");
    expect(activeLocale()).toBe("en");
  });

  it("names an ignored GUP_LANG", () => {
    const { deps, out } = run({ GUP_LANG: "klingon" });
    languageCommand(undefined, deps);
    expect(out.join("")).toContain("GUP_LANG=klingon ignored: gup speaks en, fr");
  });
});

describe("the language module", () => {
  useLocale("en");

  it("registers `gup language [code]`", async () => {
    const { Command } = await import("commander");
    const program = new Command();
    createLanguageModule(run().deps).register?.(program, { modules: [] });
    const command = program.commands.find((c) => c.name() === "language");
    expect(command?.registeredArguments.map((a) => a.name())).toEqual(["code"]);
  });

  it("reports the language on gup doctor, and warns about an ignored GUP_LANG", async () => {
    const fine = await createLanguageModule(run().deps).diagnostics?.();
    expect(fine).toEqual([{ label: "Language", value: "English (default)", status: "ok" }]);
    const ignored = await createLanguageModule(run({ GUP_LANG: "de" }).deps).diagnostics?.();
    expect(ignored?.[0]?.status).toBe("warn");
    expect(ignored?.[0]?.value).toBe("English (default) · GUP_LANG=de ignored: gup speaks en, fr");
  });
});
