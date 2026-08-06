import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { posix as posixPath, win32 as winPath } from "node:path";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Sublime Text — Package Control packages.
 *
 * Package Control runs inside the editor and auto-updates on startup; there
 * is no external CLI. This provider just enumerates `installed_packages`
 * from `Package Control.sublime-settings` so the inventory is visible.
 * Everything is flagged `manual: true` — actual updates happen on next
 * Sublime launch (or via Command Palette → Package Control: Upgrade All).
 *
 * `.sublime-settings` files are JSON-with-comments. We strip line/block
 * comments and trailing commas before parsing.
 */
export class SublimePcProvider implements Provider {
  readonly id = "sublime-pc";
  readonly displayName = "Sublime Package Control";
  readonly installHint = pickInstallHint({
    win32: "https://packagecontrol.io/",
    darwin:
      "brew install --cask sublime-text, puis Package Control : https://packagecontrol.io/",
    fallback: "https://packagecontrol.io/",
  });

  async isAvailable(): Promise<boolean> {
    return existsSync(packageControlSettingsFile());
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const file = packageControlSettingsFile();
    if (!existsSync(file)) return [];

    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      return [];
    }

    const cleaned = stripJsonComments(raw);
    let parsed: { installed_packages?: unknown };
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      return [];
    }

    const list = Array.isArray(parsed.installed_packages)
      ? (parsed.installed_packages.filter((x): x is string => typeof x === "string"))
      : [];

    return list.map((name) => ({
      id: name,
      name,
      current: "?",
      latest: "?",
      note: "auto-update via Package Control au lancement",
      manual: true,
    }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    return {
      id: packageId,
      success: false,
      skipped: true,
      message:
        "Sublime Text → Command Palette → Package Control: Upgrade Package.",
    };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    return packages.map((p) => ({
      id: p.id,
      success: false,
      skipped: true,
      message: "Update via Sublime Text (Package Control: Upgrade All).",
    }));
  }
}

function packageControlSettingsFile(): string {
  // Spread as segments (instead of pre-joining) so each branch renders the
  // separator of its own platform, whatever the host running this code.
  const file = ["Packages", "User", "Package Control.sublime-settings"];
  if (process.platform === "win32") {
    const appdata = process.env["APPDATA"];
    return appdata ? winPath.join(appdata, "Sublime Text", ...file) : "";
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"];
    return home
      ? posixPath.join(home, "Library", "Application Support", "Sublime Text", ...file)
      : "";
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return posixPath.join(xdg, "sublime-text", ...file);
  const home = process.env["HOME"];
  return home ? posixPath.join(home, ".config", "sublime-text", ...file) : "";
}

function stripJsonComments(input: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < input.length) {
    const c = input[i];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Drop trailing commas before `}` / `]`.
  return out.replace(/,(\s*[}\]])/g, "$1");
}
