import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeInheritTo } from "../../src/core/process/inherit-sink.js";
import { createPipeSink, skipCurrent } from "../../src/core/runner.js";
import type { UpdateOutcome } from "../../src/core/types.js";
import { NpmGlobalProvider } from "../../src/providers/node/npm-global.js";
import { createSandbox, type Sandbox } from "../support/e2e/sandbox.js";

/**
 * A real `npm install -g` stopped mid-download, opt-in (`GUP_MUTATE=1`): npm
 * moves the installed package and its command aside before it fetches the new
 * version, and a tree kill ends it before it can move them back. Everything
 * happens in a throw-away npm prefix, against a registry served from this
 * process — it publishes `gup-it-cli` 1.0.0 and 2.0.0 and never answers the
 * 2.0.0 tarball — so no real package, prefix or network is involved.
 */

const isEnabled = process.env["GUP_MUTATE"] === "1";
const PACKAGE = "gup-it-cli";
const OLD = "1.0.0";
const NEW = "2.0.0";
/** npm on a cold start (Defender scans every file it writes on Windows). */
const NPM_TIMEOUT_MS = 120_000;
const TARBALL_WAIT_MS = 60_000;
const POLL_MS = 100;

interface LocalRegistry {
  readonly url: string;
  /** Set once npm asked for the new version's tarball: it has staged the old copy by then. */
  hasRequestedNewTarball(): boolean;
  close(): void;
}

let sandbox: Sandbox;
let registry: LocalRegistry;
let savedEnv: NodeJS.ProcessEnv;

/** A one-file CLI package, packed by npm itself. */
async function packVersion(version: string): Promise<Buffer> {
  const dir = join(sandbox.root, "src", version);
  await mkdir(join(dir, "bin"), { recursive: true });
  const manifest = { name: PACKAGE, version, bin: { [PACKAGE]: "bin/cli.js" } };
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "bin", "cli.js"), `#!/usr/bin/env node\nconsole.log("${version}");\n`);
  const packed = await execa("npm", ["pack", dir, "--pack-destination", sandbox.root], {
    env: sandbox.env,
    extendEnv: false,
    cwd: sandbox.root,
    timeout: NPM_TIMEOUT_MS,
  });
  return readFile(join(sandbox.root, packed.stdout.trim().split(/\r?\n/).at(-1) ?? ""));
}

function packument(url: string, oldTarball: Buffer): unknown {
  const dist = (version: string, tarball: Buffer) => ({
    tarball: `${url}${PACKAGE}/-/${PACKAGE}-${version}.tgz`,
    shasum: createHash("sha1").update(tarball).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  });
  const version = (v: string, tarball: Buffer) => ({
    name: PACKAGE,
    version: v,
    bin: { [PACKAGE]: "bin/cli.js" },
    dist: dist(v, tarball),
  });
  return {
    name: PACKAGE,
    "dist-tags": { latest: NEW },
    versions: { [OLD]: version(OLD, oldTarball), [NEW]: version(NEW, Buffer.from("never sent")) },
    time: { [OLD]: "2020-01-01T00:00:00.000Z", [NEW]: "2020-01-02T00:00:00.000Z" },
  };
}

async function startRegistry(oldTarball: Buffer): Promise<LocalRegistry> {
  const held: ServerResponse[] = [];
  let url = "";
  const serve = (request: IncomingMessage, response: ServerResponse): void => {
    const path = request.url ?? "/";
    if (path.endsWith(`-${NEW}.tgz`)) return void held.push(response);
    if (path.endsWith(`-${OLD}.tgz`)) return void response.end(oldTarball);
    if (path !== `/${PACKAGE}`) return void response.writeHead(404).end("{}");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(packument(url, oldTarball)));
  };
  const server: Server = createServer(serve);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return {
    url,
    hasRequestedNewTarball: () => held.length > 0,
    close: () => {
      for (const response of held) response.destroy();
      server.close();
    },
  };
}

/** Where the sandbox's prefix keeps global packages and their commands. */
function prefixDirs(): { root: string; bin: string } {
  const prefix = sandbox.dirs.npmPrefix;
  if (process.platform === "win32") return { root: join(prefix, "node_modules"), bin: prefix };
  return { root: join(prefix, "lib", "node_modules"), bin: join(prefix, "bin") };
}

async function installedVersion(): Promise<string | null> {
  try {
    const manifest = join(prefixDirs().root, PACKAGE, "package.json");
    return (JSON.parse(await readFile(manifest, "utf8")) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

async function waitUntil(condition: () => boolean, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms && !condition(); waited += POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return condition();
}

/** Point the npm this process spawns at the sandbox's prefix, cache and registry. */
function useSandboxNpm(): void {
  savedEnv = { ...process.env };
  for (const name of Object.keys(process.env)) {
    if (/^npm_/i.test(name)) delete process.env[name];
  }
  Object.assign(process.env, sandbox.env, { npm_config_registry: registry.url });
}

beforeAll(async () => {
  if (!isEnabled) return;
  sandbox = await createSandbox("npm-staged");
  registry = await startRegistry(await packVersion(OLD));
  useSandboxNpm();
  await execa("npm", ["install", "--global", "--ignore-scripts", `${PACKAGE}@${OLD}`], {
    cwd: sandbox.root,
    timeout: NPM_TIMEOUT_MS,
  });
}, NPM_TIMEOUT_MS * 2);

afterAll(async () => {
  if (!isEnabled) return;
  process.env = savedEnv;
  registry.close();
  await sandbox.dispose();
});

describe.runIf(isEnabled)("an npm install -g stopped mid-download (GUP_MUTATE=1)", () => {
  it(
    "keeps the installed version and its command, with the outcome saying so",
    async () => {
      expect(await installedVersion()).toBe(OLD);
      // A pipe, as a scheduled run has: the kill is the same as the terminal's.
      const restoreSink = routeInheritTo(createPipeSink({ onLine: () => {}, capBytes: 4096 }));
      let outcome: UpdateOutcome;
      try {
        const update = new NpmGlobalProvider().update(PACKAGE);
        expect(await waitUntil(registry.hasRequestedNewTarball, TARBALL_WAIT_MS)).toBe(true);
        expect(skipCurrent()).toBe(true);
        outcome = await update;
      } finally {
        restoreSink();
      }

      const { root, bin } = prefixDirs();
      expect(await installedVersion()).toBe(OLD);
      const command = process.platform === "win32" ? `${PACKAGE}.cmd` : PACKAGE;
      expect(existsSync(join(bin, command))).toBe(true);
      const leftovers = [...(await readdir(root)), ...(await readdir(bin))];
      expect(leftovers.filter((name) => name.startsWith(`.${PACKAGE}`))).toEqual([]);
      expect(outcome).toEqual({
        id: PACKAGE,
        success: false,
        recovery: "version précédente restaurée",
      });
    },
    NPM_TIMEOUT_MS,
  );
});
