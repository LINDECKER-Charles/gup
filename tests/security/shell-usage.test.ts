import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

/**
 * Drift-detection: enumerate every callsite that opts into `shell: true` and
 * require it to be in our allowlist. New callsites force a deliberate code
 * review (the shell:true diff *plus* this allowlist diff) instead of silently
 * widening the command-injection surface.
 */
const ALLOWED_SHELL_TRUE_FILES = new Set<string>([
  // scoop ships a PowerShell entrypoint that must be resolved through the shell.
  "src/providers/os/scoop.ts",
  // self-update path for scoop in the meta-provider — same .ps1 shim constraint.
  "src/providers/self.ts",
  "src/core/install-source.ts",
]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function toPosixRel(absolute: string): string {
  return relative(process.cwd(), absolute).split(sep).join("/");
}

describe("shell:true usage is allowlisted", () => {
  it("every shell:true callsite lives in an allowlisted file", async () => {
    const files = await walk(SRC_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (!/shell\s*:\s*true/.test(content)) continue;
      const rel = toPosixRel(file);
      if (!ALLOWED_SHELL_TRUE_FILES.has(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      "Unexpected shell:true usage — review and add to ALLOWED_SHELL_TRUE_FILES if intentional.",
    ).toEqual([]);
  });

  it("no source file uses child_process directly — runner.ts is the single chokepoint", async () => {
    const files = await walk(SRC_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = toPosixRel(file);
      if (rel === "src/core/runner.ts") continue;
      const content = await readFile(file, "utf8");
      if (/from\s+["']node:child_process["']/.test(content)) offenders.push(rel);
      if (/require\(["']child_process["']\)/.test(content)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
