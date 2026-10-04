import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import type { Sandbox } from "./sandbox.js";

/**
 * The sandbox's npm global prefix, filled and read the way a user's is: the
 * suites install old versions of tiny dependency-free packages there, then
 * let gup find and update them. Nothing outside the prefix (and the
 * sandbox's npm cache) is ever written.
 */

const NPM_TIMEOUT_MS = 120_000;

/** `npm install -g`, install scripts off: no package code runs on the machine. */
export async function installGlobal(sandbox: Sandbox, specs: readonly string[]): Promise<void> {
  const result = await npm(sandbox, ["install", "--global", "--ignore-scripts", ...specs]);
  if (result.exitCode !== 0) {
    throw new Error(`npm install -g ${specs.join(" ")} failed:\n${result.stderr}`);
  }
}

/** What the registry calls the latest version of `name`. */
export async function latestVersion(sandbox: Sandbox, name: string): Promise<string> {
  const result = await npm(sandbox, ["view", name, "version"]);
  const version = result.stdout.trim();
  if (result.exitCode !== 0 || version === "") {
    throw new Error(`npm view ${name} version failed:\n${result.stderr}`);
  }
  return version;
}

/** The version of `name` installed in the sandbox's prefix, or null. */
export async function installedVersion(sandbox: Sandbox, name: string): Promise<string | null> {
  const manifest = join(sandbox.dirs.npmGlobalRoot, name, "package.json");
  try {
    const parsed = JSON.parse(await readFile(manifest, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

interface NpmRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function npm(sandbox: Sandbox, args: readonly string[]): Promise<NpmRun> {
  const result = await execa("npm", args, {
    env: sandbox.env,
    extendEnv: false,
    cwd: sandbox.root,
    reject: false,
    timeout: NPM_TIMEOUT_MS,
    windowsHide: true,
  });
  return { exitCode: result.exitCode ?? -1, stdout: result.stdout, stderr: result.stderr };
}
