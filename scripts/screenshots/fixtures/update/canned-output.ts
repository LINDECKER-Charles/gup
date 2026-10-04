/** A line break as a pseudo-terminal sends it. */
const NEWLINE = "\r\n";
/** winget's download bar: 30 cells, eighths of a cell for the partial one. */
const BAR_CELLS = 30;
const EIGHTHS = 8;
const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const;
/** The sizes from which winget writes one decimal, then none. */
const ONE_DECIMAL_FROM = 10;
const NO_DECIMAL_FROM = 100;

/** What winget prints once it found the package, in an English Windows. */
const WINGET_PREAMBLE = [
  "This application is licensed to you by its owner.",
  "Microsoft is not responsible for, nor does it grant any licenses to, third-party packages.",
] as const;

/** How a winget install ends, after its download. */
export type WingetEnding = "installed" | "hash-mismatch" | "downloading";

export interface WingetDownload {
  readonly name: string;
  readonly id: string;
  readonly version: string;
  readonly url: string;
  /** Megabytes: what is downloaded so far, and the installer's size. */
  readonly received: number;
  readonly total: number;
}

const ENDINGS: Readonly<Record<WingetEnding, readonly string[]>> = {
  installed: [
    "Successfully verified installer hash",
    "Starting package install...",
    "Successfully installed",
  ],
  // Overriding the hash takes an admin setting, off by default: winget stops there.
  "hash-mismatch": ["Installer hash does not match."],
  downloading: [],
};

/**
 * What `winget upgrade` prints in the pane, in English: the package found,
 * the licence notice, the download with its bar — then the end, unless the
 * install is still downloading (the bar is then the last line, cursor on it).
 */
export function wingetOutput(download: WingetDownload, ending: WingetEnding): string {
  const lines = [
    `Found ${download.name} [${download.id}] Version ${download.version}`,
    ...WINGET_PREAMBLE,
    `Downloading ${download.url}`,
  ];
  const bar = `  ${progressBar(download.received / download.total)}  ${downloadSizes(download)}`;
  if (ending === "downloading") return `${lines.join(NEWLINE)}${NEWLINE}${bar}`;
  return [...lines, bar, ...ENDINGS[ending]].map((line) => `${line}${NEWLINE}`).join("");
}

/** The end of winget's download bar: " 118 MB /  196 MB". */
export function downloadSizes({ received, total }: WingetDownload): string {
  return `${megabytes(received)} / ${megabytes(total)}`;
}

/** What npm prints for one global package. */
export function npmOutput(seconds: number): string {
  return `${NEWLINE}changed 1 package in ${seconds}s${NEWLINE}`;
}

/** What pipx prints for one upgraded package. */
export function pipxOutput(name: string, from: string, to: string): string {
  return `upgraded package ${name} from ${from} to ${to}${NEWLINE}`;
}

function progressBar(ratio: number): string {
  const eighths = Math.round(Math.min(1, Math.max(0, ratio)) * BAR_CELLS * EIGHTHS);
  const full = Math.floor(eighths / EIGHTHS);
  const partial = PARTIAL_BLOCKS[eighths % EIGHTHS] ?? "";
  return `${"█".repeat(full)}${partial}`.padEnd(BAR_CELLS, " ");
}

/**
 * A size as winget writes it, in every language: a point before the
 * decimals, two of them under 10, one under 100, none above but a space in
 * front, so that every number takes four characters (`1.60`, `68.2`, ` 196`).
 */
function megabytes(value: number): string {
  if (value < ONE_DECIMAL_FROM) return `${value.toFixed(2)} MB`;
  if (value < NO_DECIMAL_FROM) return `${value.toFixed(1)} MB`;
  return ` ${value.toFixed(0)} MB`;
}
