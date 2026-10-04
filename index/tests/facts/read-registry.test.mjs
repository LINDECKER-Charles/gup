/**
 * The registry reader behind src/data/facts.js: what it counts, per domain and
 * per system, and the source shapes it refuses rather than misread.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRegistry } from "../../build/facts/read-registry.mjs";

const REGISTRY = `
import { WingetProvider } from "../providers/os/winget.js";
import { BrewProvider } from "../providers/os/brew.js";
import { MasProvider } from "../providers/os/mas.js";
import { NpmGlobalProvider } from "../providers/node/npm-g.js";
import { ZedProvider } from "../providers/ide/zed-ext.js";
import { SelfProvider } from "../providers/self.js";

export const ALL_PROVIDERS: Provider[] = [
  new WingetProvider(),
  new BrewProvider(),
  new MasProvider(),
  new NpmGlobalProvider(),
  new SelfProvider(),
];
`;

const provider = (id, declaration = "") =>
  `export class P implements Provider {\n  readonly id = "${id}";\n  ${declaration}\n}\n`;

const SOURCES = {
  "os/winget": provider("winget", "readonly platforms = PLATFORMS.windows;"),
  "os/brew": provider("brew", "readonly platforms = PLATFORMS.notWindows;"),
  "os/mas": provider("mas", "readonly platforms = PLATFORMS.macos;"),
  "node/npm-g": provider("npm-g"),
  "ide/zed-ext": provider("zed-ext", "readonly platforms = PLATFORMS.windows;"),
  self: provider("self"),
};

const read = (sources) => (relative) => {
  if (!(relative in sources)) throw new Error(`fixture has no ${relative}`);
  return sources[relative];
};

test("counts the providers ALL_PROVIDERS instantiates, never an imported-only file", () => {
  const { providerCount, providersByDomain } = readRegistry(REGISTRY, read(SOURCES));
  assert.equal(providerCount, 5);
  assert.deepEqual(providersByDomain, {
    os: ["brew", "mas", "winget"],
    node: ["npm-g"],
    self: ["self"],
  });
});

test("counts each system from the platforms declarations; none means every system", () => {
  const { providersBySystem } = readRegistry(REGISTRY, read(SOURCES));
  assert.deepEqual(providersBySystem, { windows: 3, macos: 4, linux: 3 });
});

test("refuses a platform set it cannot map to the site's systems", () => {
  const sources = { ...SOURCES, "os/mas": provider("mas", "readonly platforms = PLATFORMS.bsd;") };
  const refusal = /os\/mas\.ts declares PLATFORMS\.bsd/;
  assert.throws(() => readRegistry(REGISTRY, read(sources)), refusal);
});

test("refuses a platforms field it cannot read rather than counting it everywhere", () => {
  const declaration = 'readonly platforms: PlatformSet = ["win32"];';
  const sources = { ...SOURCES, "os/winget": provider("winget", declaration) };
  const refusal = /os\/winget\.ts declares its platforms/;
  assert.throws(() => readRegistry(REGISTRY, read(sources)), refusal);
});

test("refuses a registry whose modules and entries disagree", () => {
  const entry = "  new MasProvider(),\n";
  const twice = REGISTRY.replace(entry, entry + entry);
  assert.throws(() => readRegistry(twice, read(SOURCES)), /5 provider modules but .* 6 entries/);
});
