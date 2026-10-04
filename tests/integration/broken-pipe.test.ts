import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The real CLI writing to a pipe whose reader is gone, as in `gup doctor |
 * true` or `gup report -f csv | head`. `doctor` writes its providers, then
 * awaits its system checks before writing again: the stream's EPIPE error
 * surfaces in between, which used to end the run on an unhandled 'error'
 * event (a stack trace, exit code 1).
 */

const CLI = join(process.cwd(), "src", "cli.ts");
/** tsx start-up and doctor's bounded probes on a loaded runner. */
const RUN_TIMEOUT_MS = 60_000;

async function gupWithoutReader(args: readonly string[]): Promise<{ code: number | null; stderr: string }> {
  const child = spawn(process.execPath, ["--import", "tsx", CLI, ...args], {
    env: { ...process.env, GUP_HISTORY: "0", GUP_CONFIG: "0", GUP_LOG_LEVEL: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The reader leaves before gup writes anything.
  child.stdout.destroy();
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => void (stderr += chunk.toString()));
  const [code] = (await once(child, "exit")) as [number | null];
  return { code, stderr };
}

describe("standard output closed by its reader", () => {
  it(
    "ends the run with 0 and nothing on the error output",
    async () => {
      const { code, stderr } = await gupWithoutReader(["doctor"]);

      expect(stderr).not.toContain("EPIPE");
      expect(stderr).toBe("");
      expect(code).toBe(0);
    },
    RUN_TIMEOUT_MS,
  );
});
