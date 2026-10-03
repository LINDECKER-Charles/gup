/**
 * Errors of the strict fake machine. A provider under test usually swallows
 * whatever its probes throw (fail-soft), so each of these is also recorded by
 * the system and turned into a test failure after the test (install.ts): an
 * incomplete case can never pass by accident.
 */

function formatArgv(argv: readonly string[]): string {
  return JSON.stringify(argv);
}

/** A present binary was spawned with an argv no `CommandScript` declares. */
export class UnscriptedSpawnError extends Error {
  override readonly name = "UnscriptedSpawnError";

  constructor(argv: readonly string[], scripted: readonly (readonly string[])[]) {
    const known = scripted.length > 0 ? scripted.map(formatArgv).join("\n  ") : "(none)";
    super(`unscripted spawn ${formatArgv(argv)}\nscripted argvs:\n  ${known}`);
  }
}

/** A URL no `HttpRoute` declares was fetched. */
export class UnscriptedRequestError extends Error {
  override readonly name = "UnscriptedRequestError";

  constructor(method: string, url: string, scripted: readonly string[]) {
    const known = scripted.length > 0 ? scripted.join("\n  ") : "(none)";
    super(`unscripted request ${method} ${url}\nscripted routes:\n  ${known}`);
  }
}

/** The code under test used a part of a boundary the fake does not model. */
export class FakeSystemUsageError extends Error {
  override readonly name = "FakeSystemUsageError";
}

/** A Node-style errno error, as `node:fs` raises them. */
export function fsError(code: string, syscall: string, path: string): NodeJS.ErrnoException {
  const descriptions: Readonly<Record<string, string>> = {
    ENOENT: "no such file or directory",
    EACCES: "permission denied",
    EEXIST: "file already exists",
    EISDIR: "illegal operation on a directory",
    ENOTDIR: "not a directory",
    ENOTEMPTY: "directory not empty",
    ELOOP: "too many symbolic links encountered",
  };
  const error: NodeJS.ErrnoException = new Error(
    `${code}: ${descriptions[code] ?? "error"}, ${syscall} '${path}'`,
  );
  error.code = code;
  error.syscall = syscall;
  error.path = path;
  return error;
}

/**
 * The failure a test gets when it left strict-mode violations behind (null
 * when it left none). Thrown from the providers project's afterEach.
 */
export function violationReport(violations: readonly Error[]): string | null {
  if (violations.length === 0) return null;
  const details = violations.map((violation) => `- ${violation.message}`).join("\n");
  return (
    `${violations.length} strict fake-system violation(s), swallowed or not by the code under ` +
    "test. Script the call, or call system.acknowledgeUnscripted() if the test provoked it on " +
    `purpose:\n${details}`
  );
}
