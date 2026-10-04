/** A line break as a pseudo-terminal sends it. */
const NEWLINE = "\r\n";
/** winget's download bar: 30 cells, eighths of a cell for the partial one. */
const BAR_CELLS = 30;
const EIGHTHS = 8;
const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const;

/** What winget prints once it found the package, in a French Windows. */
const WINGET_PREAMBLE = [
  "Ce package d’application vous est concédé sous licence par son propriétaire.",
  "Microsoft n’est pas responsable des packages tiers et n’accorde pas de licences à ceux-ci.",
] as const;

/** How a winget install ends, after its download. */
export type WingetEnding = "installed" | "hash-mismatch" | "downloading";

export interface WingetDownload {
  readonly name: string;
  readonly id: string;
  readonly version: string;
  readonly url: string;
  /** Megabytes (French "Mo"): what is downloaded so far, and the installer's size. */
  readonly received: number;
  readonly total: number;
}

const ENDINGS: Readonly<Record<WingetEnding, readonly string[]>> = {
  installed: [
    "Le hachage de l’installateur a été vérifié avec succès",
    "Démarrage du package d’installation... Merci de patienter.",
    "Installé correctement",
  ],
  "hash-mismatch": [
    "Le hachage de l’installateur ne correspond pas.",
    "Échec de l’installation : le fichier téléchargé a été supprimé.",
  ],
  downloading: [],
};

/**
 * What `winget upgrade` prints in the pane, in French: the package found,
 * the licence notice, the download with its bar — then the end, unless the
 * install is still downloading (the bar is then the last line, cursor on it).
 */
export function wingetOutput(download: WingetDownload, ending: WingetEnding): string {
  const lines = [
    `Trouvé ${download.name} [${download.id}] Version ${download.version}`,
    ...WINGET_PREAMBLE,
    `Téléchargement en cours ${download.url}`,
  ];
  const bar = `  ${progressBar(download.received / download.total)}  ${sizes(download)}`;
  if (ending === "downloading") return `${lines.join(NEWLINE)}${NEWLINE}${bar}`;
  return [...lines, bar, ...ENDINGS[ending]].map((line) => `${line}${NEWLINE}`).join("");
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

function sizes({ received, total }: WingetDownload): string {
  return `${megabytes(received)} / ${megabytes(total)}`;
}

/** `118 Mo`, `68,2 Mo`: French decimals, none for a whole number. */
function megabytes(value: number): string {
  const number = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return `${number} Mo`;
}
