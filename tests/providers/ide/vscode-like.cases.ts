import type { OutdatedPackage, Provider } from "../../../src/core/types.js";
import { CursorExtProvider } from "../../../src/providers/ide/cursor-ext.js";
import { VsCodeExtProvider } from "../../../src/providers/ide/vscode-ext.js";
import { VsCodiumExtProvider } from "../../../src/providers/ide/vscodium-ext.js";
import { WindsurfExtProvider } from "../../../src/providers/ide/windsurf-ext.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { WIN_HOME } from "../../support/system/os-identity.js";
import type { HttpRoute, SimPlatform, SystemSpec } from "../../support/system/types.js";

/**
 * VS Code and its forks share one extension CLI (`<bin> --list-extensions
 * --show-versions`, `<bin> --install-extension <id> --force`) and differ in
 * their gallery: the Microsoft Marketplace (one POST endpoint, the extension
 * named in the query) or Open VSX (one GET URL per extension).
 */

export const LIST_EXTENSIONS_ARGS = ["--list-extensions", "--show-versions"];

export const MARKETPLACE_QUERY_URL =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

/** The Marketplace's answer to an extension query: `version` first, or no version at all. */
export function marketplaceRoute(version?: string): HttpRoute {
  const versions = version ? [{ version }] : [];
  return {
    url: MARKETPLACE_QUERY_URL,
    method: "POST",
    json: { results: [{ extensions: [{ versions }] }] },
  };
}

/** `GET https://open-vsx.org/api/<publisher>/<name>` → `{ version }`. */
export function openVsxRoute(publisher: string, name: string, version: string): HttpRoute {
  const path = `${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`;
  return { url: `https://open-vsx.org/api/${path}`, json: { version } };
}

export interface EditorMachine {
  readonly platform: SimPlatform;
  readonly binary: string;
  /** What `--list-extensions --show-versions` prints. */
  readonly listing: string;
  readonly http?: readonly HttpRoute[];
}

const BINARY_DIR: Readonly<Record<SimPlatform, string>> = {
  win32: `${WIN_HOME}\\AppData\\Local\\Programs\\Microsoft VS Code\\bin`,
  darwin: "/usr/local/bin",
  linux: "/usr/bin",
};

/** An editor on PATH listing its extensions, its gallery answering `http`. */
export function editorMachine(editor: EditorMachine): SystemSpec {
  const separator = editor.platform === "win32" ? "\\" : "/";
  const suffix = editor.platform === "win32" ? ".cmd" : "";
  return {
    platform: editor.platform,
    bin: { [editor.binary]: `${BINARY_DIR[editor.platform]}${separator}${editor.binary}${suffix}` },
    commands: [{ argv: [editor.binary, ...LIST_EXTENSIONS_ARGS], stdout: editor.listing }],
    http: editor.http ?? [],
  };
}

function extensionRow(id: string, current: string, latest: string): OutdatedPackage {
  return { id, name: id, current, latest };
}

function installArgv(binary: string, id: string): string[] {
  return [binary, "--install-extension", id, "--force"];
}

interface ExtensionCase {
  readonly create: () => Provider;
  readonly machine: EditorMachine;
  readonly rows: readonly OutdatedPackage[];
  readonly scenario?: string;
}

/** Each outdated extension is reinstalled at the gallery's version, one `--force` per row. */
function extensionCase(entry: ExtensionCase): ProviderContractCase {
  const first = entry.rows[0];
  return {
    ...(entry.scenario && { scenario: entry.scenario }),
    create: entry.create,
    system: editorMachine(entry.machine),
    outdated: entry.rows,
    ...(first && {
      update: { packageId: first.id, installs: [installArgv(entry.machine.binary, first.id)] },
    }),
    updateAll: "per-package",
  };
}

const VS_CODE: ExtensionCase = {
  create: () => new VsCodeExtProvider(),
  machine: {
    platform: "win32",
    binary: "code",
    listing: "ms-python.python@2024.1.0\n",
    http: [marketplaceRoute("2024.2.0")],
  },
  rows: [extensionRow("ms-python.python", "2024.1.0", "2024.2.0")],
};

const VS_CODE_UP_TO_DATE: ExtensionCase = {
  ...VS_CODE,
  scenario: "up to date",
  machine: { ...VS_CODE.machine, http: [marketplaceRoute("2024.1.0")] },
  rows: [],
};

const CURSOR: ExtensionCase = {
  create: () => new CursorExtProvider(),
  machine: {
    platform: "darwin",
    binary: "cursor",
    listing: "esbenp.prettier-vscode@10.0.0\n",
    http: [marketplaceRoute("10.1.0")],
  },
  rows: [extensionRow("esbenp.prettier-vscode", "10.0.0", "10.1.0")],
};

const WINDSURF: ExtensionCase = {
  create: () => new WindsurfExtProvider(),
  machine: {
    platform: "linux",
    binary: "windsurf",
    listing: "golang.go@0.41.0\n",
    http: [marketplaceRoute("0.42.1")],
  },
  rows: [extensionRow("golang.go", "0.41.0", "0.42.1")],
};

/** Two extensions, so the one-request-per-row scan has to declare itself slow. */
const VSCODIUM: ExtensionCase = {
  create: () => new VsCodiumExtProvider(),
  machine: {
    platform: "linux",
    binary: "codium",
    listing: "rust-lang.rust-analyzer@0.3.1900\nredhat.vscode-yaml@1.14.0\n",
    http: [
      openVsxRoute("rust-lang", "rust-analyzer", "0.3.1950"),
      openVsxRoute("redhat", "vscode-yaml", "1.15.0"),
    ],
  },
  rows: [
    extensionRow("rust-lang.rust-analyzer", "0.3.1900", "0.3.1950"),
    extensionRow("redhat.vscode-yaml", "1.14.0", "1.15.0"),
  ],
};

export const vscodeLikeCases: readonly ProviderContractCase[] = [
  VS_CODE,
  VS_CODE_UP_TO_DATE,
  CURSOR,
  WINDSURF,
  VSCODIUM,
].map(extensionCase);
