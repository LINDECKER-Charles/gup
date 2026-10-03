/**
 * Check bookkeeping for the verify suite: prints one line per check, keeps the
 * failures, and turns them into the process exit code at the end.
 */
const write = (line) => process.stdout.write(`${line}\n`);

export function createReport() {
  const failures = [];
  return {
    section(title) {
      write(`\n${title}`);
    },
    /**
     * @param {string} label
     * @param {boolean} ok
     * @param {string} [detail]  Shown on failure only.
     */
    check(label, ok, detail = "") {
      if (ok) return write(`  ok   ${label}`);
      failures.push(detail ? `${label} — ${detail}` : label);
      return write(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    },
    /** Prints the summary and sets the exit code. */
    finish() {
      write(
        failures.length
          ? `\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`
          : "\nall checks passed",
      );
      process.exitCode = failures.length ? 1 : 0;
    },
  };
}
