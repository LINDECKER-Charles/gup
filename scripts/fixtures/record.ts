/**
 * Fixture recorder: re-records, from the real tools installed here, the probe
 * outputs the contract cases reference with `fixture(...)`, as gup receives
 * them (the real runner: UTF-8 decoding, final newline stripped, windowsHide).
 *
 *   npm run fixtures:record -- --provider winget pip
 *   npm run fixtures:record -- --domain wsl --dry-run
 *
 * Safety: only the probes the cases declare are run, never an install; every
 * output is redacted (user, host, home) and secret-scanned before it is
 * written, and a hit aborts the run. Recorded files list installed software:
 * review them and neutralise the package names before committing (see the
 * provider-contracts design note).
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { arch, release, version } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { commandExists, run } from "../../src/core/runner.js";
import type { ProviderContractCase } from "../../tests/support/contract/types.js";
import { findSecrets, hostRedactionContext, redact } from "../../tests/support/fixtures/redact.js";
import {
  type FixtureManifest,
  fixtureTargets,
  fixtureText,
  type LabelledCase,
  type ManifestEntry,
  parseRecordArgs,
  type RecordTarget,
  selectTargets,
  withManifestEntry,
} from "../../tests/support/fixtures/recording.js";
import { type FixtureRef, fixtureFile } from "../../tests/support/fixtures/refs.js";
import type { SimPlatform } from "../../tests/support/system/types.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PROVIDER_TESTS = join(ROOT, "tests", "providers");
const redaction = hostRedactionContext();
const totals: Record<string, number> = { "<USER>": 0, "<HOME>": 0, "<HOST>": 0 };

function isContractCase(value: unknown): value is ProviderContractCase {
  const candidate = value as Partial<ProviderContractCase> | null;
  return typeof candidate?.create === "function" && typeof candidate.system === "object";
}

/** Every case exported by tests/providers/<domain>/*.cases.ts, with its domain and id. */
async function loadCases(): Promise<LabelledCase[]> {
  const seen = new Set<ProviderContractCase>();
  const cases: LabelledCase[] = [];
  for (const domain of await readdir(PROVIDER_TESTS)) {
    const files = await readdir(join(PROVIDER_TESTS, domain)).catch(() => []);
    for (const file of files.filter((name) => name.endsWith(".cases.ts"))) {
      const url = pathToFileURL(join(PROVIDER_TESTS, domain, file)).href;
      const exported = Object.values((await import(url)) as object).filter(Array.isArray);
      for (const contractCase of exported.flat().filter(isContractCase)) {
        if (seen.has(contractCase)) continue;
        seen.add(contractCase);
        cases.push({ domain, providerId: contractCase.create().id, contractCase });
      }
    }
  }
  return cases;
}

async function isInstalled(command: string): Promise<boolean> {
  return isAbsolute(command) ? existsSync(command) : commandExists(command);
}

/** `text` redacted, or an error when a credential survives the redaction. */
function publishable(ref: FixtureRef, text: string): ReturnType<typeof redact> {
  const redacted = redact(text, redaction);
  const kinds = [...new Set(findSecrets(redacted.text).map((hit) => hit.kind))];
  if (kinds.length > 0) {
    const found = kinds.join(", ");
    throw new Error(`secret scan: ${found} in the output for ${ref.path}; nothing written`);
  }
  for (const [placeholder, count] of Object.entries(redacted.counts)) {
    totals[placeholder] = (totals[placeholder] ?? 0) + count;
  }
  return redacted;
}

/** The manifest at `manifestFile`, or null when this directory has none yet. */
async function readManifest(manifestFile: string): Promise<FixtureManifest | null> {
  try {
    return JSON.parse(await readFile(manifestFile, "utf8")) as FixtureManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function updateManifest(file: string, entry: ManifestEntry): Promise<void> {
  const manifestFile = join(dirname(file), "_manifest.json");
  const next = withManifestEntry(await readManifest(manifestFile), entry);
  await writeFile(manifestFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

type Origin = Pick<ManifestEntry, "argv" | "gup">;
async function writeFixture(ref: FixtureRef, text: string, origin: Origin): Promise<string> {
  const redacted = publishable(ref, text);
  const file = fixtureFile(ref);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, fixtureText(redacted.text), "utf8");
  await updateManifest(file, {
    file: basename(file),
    argv: origin.argv,
    platform: process.platform,
    os: `${version()} ${release()}`,
    recordedAt: new Date().toISOString().slice(0, 10),
    gup: origin.gup,
    redactions: redacted.counts,
  });
  const lines = redacted.text === "" ? 0 : redacted.text.split(/\r?\n/).length;
  return `${relative(ROOT, file).split("\\").join("/")}  ${lines} lines`;
}

async function record(target: RecordTarget, gup: string, isDryRun: boolean): Promise<string> {
  const label = `  ${target.providerId}  ${target.argv.join(" ")}`;
  const refs = [target.stdout, target.stderr].filter((ref) => ref !== undefined);
  if (isDryRun) return `${label}  → ${refs.map((ref) => ref.path).join(", ")}  (dry run)`;
  const [command = "", ...args] = target.argv;
  const result = await run(command, args);
  const origin = { argv: [...target.argv], gup };
  const written: string[] = [];
  if (target.stdout) written.push(await writeFixture(target.stdout, result.stdout, origin));
  if (target.stderr) written.push(await writeFixture(target.stderr, result.stderr, origin));
  return `${label}  → ${written.join(", ")}  (exit ${result.exitCode})`;
}

async function main(): Promise<void> {
  const request = parseRecordArgs(process.argv.slice(2));
  const platform = process.platform as SimPlatform;
  const targets = selectTargets(fixtureTargets(await loadCases(), platform), request);
  const gup = (await run("git", ["rev-parse", "--short", "HEAD"])).stdout.trim() || "unknown";
  const host = `${platform} ${arch()} · ${version()} · Node ${process.version} · gup ${gup}`;
  console.log(`gup fixture recorder — ${host}`);
  const skipped: string[] = [];
  for (const target of targets) {
    const command = target.argv[0] ?? "";
    if (await isInstalled(command)) console.log(await record(target, gup, request.isDryRun));
    else skipped.push(`${target.providerId} (${command} not on PATH)`);
  }
  if (targets.length === 0) console.log(`  nothing to record for ${platform} with these filters`);
  if (skipped.length > 0) console.log(`  skipped  ${skipped.join(" · ")}`);
  if (request.isDryRun) return;
  const counts = Object.entries(totals).map(([placeholder, count]) => `${count} × ${placeholder}`);
  console.log(`  redacted  ${counts.join(", ")}      secret scan: clean`);
  const domains = [...new Set(targets.map((target) => `tests/providers/${target.domain}`))];
  console.log(`  next  npm run test:unit -- -u ${domains.join(" ")}   then review the diff`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
