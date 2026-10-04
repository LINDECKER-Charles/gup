import { posix, win32 } from "node:path";
import { launchDetached, whichFirst } from "../runner.js";

/**
 * Opening a file gup wrote (the HTML report) with the user's default
 * application — through the runner's detached launch, so the argv barrier
 * applies and nothing waits for the browser:
 *
 * - Windows: `%SystemRoot%\explorer.exe <file>`, by absolute path (no PATH
 *   lookup to hijack). explorer splits its arguments on commas and quotes, so
 *   a path holding one is not opened: it is printed instead.
 * - macOS: `/usr/bin/open <file>`.
 * - Linux and others: `xdg-open`; under WSL `wslview` first, which opens the
 *   Windows browser where a bare `xdg-open` may fall back to a text browser.
 *
 * Only an HTML page is ever handed over: the default application of any
 * other name may run it (`.hta` through mshta, `.command` on macOS, `.desktop`
 * on Linux), and `gup report --out` lets the user pick the name of an HTML
 * report. On Windows, a path naming an alternate data stream (`x.hta:y.html`)
 * is refused too.
 *
 * Never a shell, `cmd /c start`, nor `rundll32 url.dll` (a LOLBin EDRs flag).
 * The launcher's exit code means nothing (explorer often exits 1): a started
 * process is an opened file.
 */

export interface OpenResult {
  readonly opened: boolean;
  /** The program started, or null when none could be. */
  readonly launcher: string | null;
  /** Why the file was not opened (English, for the log). */
  readonly reason?: string;
  /** Not opened because it is not an HTML page: no launcher was even looked for. */
  readonly isNotHtml?: boolean;
}

export type Launch = (command: string, args: readonly string[]) => Promise<boolean>;

/** What the platform offers to open a file: the facts {@link openerFor} decides on. */
export interface OpenerFacts {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  /** Absolute paths of the desktop launchers found on PATH (Linux and others). */
  readonly launchers: { readonly xdgOpen: string | null; readonly wslview: string | null };
}

export type Opener =
  | { readonly command: string; readonly args: readonly string[] }
  | { readonly reason: string };

export interface OpenDeps {
  readonly launch: Launch;
  readonly which: (command: string) => Promise<string | null>;
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
}

const DEFAULT_WINDOWS_ROOT = "C:\\Windows";
/** What the default application may open: gup's HTML report, nothing that could run. */
const HTML_EXTENSIONS: ReadonlySet<string> = new Set([".html", ".htm"]);
/** Characters explorer.exe reads as argument separators. */
const EXPLORER_SEPARATORS = /[,"]/;
const MAC_OPEN = "/usr/bin/open";
const NO_LAUNCHERS = { xdgOpen: null, wslview: null } as const;

/** Opens `file` (an absolute path); never throws. */
export async function openExternal(
  file: string,
  overrides: Partial<OpenDeps> = {},
): Promise<OpenResult> {
  const deps: OpenDeps = {
    launch: launchDetached,
    which: whichFirst,
    platform: process.platform,
    env: process.env,
    ...overrides,
  };
  if (!isHtmlFile(file, deps.platform)) {
    return { opened: false, launcher: null, reason: "not an HTML file", isNotHtml: true };
  }
  const opener = openerFor(file, await factsOf(deps));
  if ("reason" in opener) return { opened: false, launcher: null, reason: opener.reason };
  if (await isStarted(deps.launch, opener)) return { opened: true, launcher: opener.command };
  return { opened: false, launcher: opener.command, reason: "the launcher did not start" };
}

/** The command that opens `file` on the platform of `facts`, or why there is none. Pure. */
export function openerFor(file: string, facts: OpenerFacts): Opener {
  if (facts.platform === "win32") return windowsOpener(file, facts.env);
  if (!posix.isAbsolute(file)) return { reason: "not an absolute path" };
  if (facts.platform === "darwin") return { command: MAC_OPEN, args: [file] };
  const { xdgOpen, wslview } = facts.launchers;
  const launcher = isWsl(facts.env) ? (wslview ?? xdgOpen) : xdgOpen;
  if (launcher === null) return { reason: "no xdg-open (or wslview) on PATH" };
  return { command: launcher, args: [file] };
}

/** `.html` or `.htm`, whatever the case, read with the platform's own separators. */
function isHtmlFile(file: string, platform: NodeJS.Platform): boolean {
  const path = platform === "win32" ? win32 : posix;
  return HTML_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function windowsOpener(file: string, env: NodeJS.ProcessEnv): Opener {
  if (!win32.isAbsolute(file)) return { reason: "not an absolute path" };
  if (EXPLORER_SEPARATORS.test(file)) return { reason: "explorer cannot open a path with , or \"" };
  if (namesStream(file)) return { reason: "the path names an alternate data stream" };
  const root = env["SystemRoot"];
  const windowsDir = root !== undefined && win32.isAbsolute(root) ? root : DEFAULT_WINDOWS_ROOT;
  return { command: win32.join(windowsDir, "explorer.exe"), args: [file] };
}

/** A launcher refused by the runner's argv barrier (it throws) did not start either. */
async function isStarted(
  launch: Launch,
  { command, args }: { readonly command: string; readonly args: readonly string[] },
): Promise<boolean> {
  try {
    return await launch(command, args);
  } catch {
    return false;
  }
}

/** A `:` past the root (`C:\`, `\\?\C:\`): NTFS reads `x.hta:y.html` as a stream of `x.hta`. */
function namesStream(file: string): boolean {
  return file.slice(win32.parse(file).root.length).includes(":");
}

function isWsl(env: NodeJS.ProcessEnv): boolean {
  return (env["WSL_DISTRO_NAME"] ?? "") !== "";
}

/** PATH is only searched where a desktop launcher has to be found there. */
async function factsOf(deps: OpenDeps): Promise<OpenerFacts> {
  const { platform, env } = deps;
  if (platform === "win32" || platform === "darwin") {
    return { platform, env, launchers: NO_LAUNCHERS };
  }
  const [xdgOpen, wslview] = await Promise.all([
    deps.which("xdg-open").catch(() => null),
    isWsl(env) ? deps.which("wslview").catch(() => null) : Promise.resolve(null),
  ]);
  return { platform, env, launchers: { xdgOpen, wslview } };
}
