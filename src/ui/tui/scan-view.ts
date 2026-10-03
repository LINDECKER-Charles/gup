import { screenHost, type PromptHost, type PromptScreen } from "./prompt-host.js";
import { seg, type Line } from "./styled-lines.js";

export interface ScanState {
  readonly done: number;
  readonly total: number;
  /** Display names of the providers scanning right now. */
  readonly inFlight: readonly string[];
  /** Most recent provider failure, kept on screen until the scan ends. */
  readonly lastError?: string;
}

/** What the scan reports as it goes. */
export interface ScanProgress {
  detecting(): void;
  scanning(state: ScanState): void;
}

/** For non-interactive runs: the scan reports, nobody draws. */
export const SILENT_PROGRESS: ScanProgress = { detecting() {}, scanning() {} };

const FRAME_MS = 100;
const SPINNER = ["◒", "◐", "◓", "◑"];
const BAR_WIDTH = 24;
const MAX_IN_FLIGHT_SHOWN = 4;

/**
 * Run `work` under a live progress band. The band disappears when the work
 * settles; the caller prints the line that stays in the scrollback.
 */
export function withScanView<T>(
  work: (progress: ScanProgress) => Promise<T>,
  host: PromptHost = screenHost,
): Promise<T> {
  return host.run((screen) => runWithBand(screen, work));
}

async function runWithBand<T>(
  screen: PromptScreen,
  work: (progress: ScanProgress) => Promise<T>,
): Promise<T> {
  let frame = 0;
  let state: ScanState | null = null;
  const draw = (): void => screen.show(render(SPINNER[frame % SPINNER.length] ?? "◒", state));
  const timer = setInterval(() => {
    frame++;
    draw();
  }, FRAME_MS);
  draw();
  try {
    return await work({
      detecting: () => {
        state = null;
        draw();
      },
      scanning: (next) => {
        state = next;
        draw();
      },
    });
  } finally {
    clearInterval(timer);
  }
}

function render(spinner: string, state: ScanState | null): Line[] {
  if (!state) return [[seg(spinner, "accent"), seg("  détection des providers…", "muted")]];
  const lines: Line[] = [
    [seg(spinner, "accent"), seg(`  scan ${state.done}/${state.total}  `), ...bar(state)],
  ];
  if (state.inFlight.length > 0) {
    lines.push([seg("│  ", "accent"), seg(describeInFlight(state), "muted")]);
  }
  if (state.lastError) {
    lines.push([seg("│  ", "accent"), seg("✖ ", "danger"), seg(state.lastError, "muted")]);
  }
  return lines;
}

function bar({ done, total }: ScanState): Line {
  const filled = total > 0 ? Math.round((done / total) * BAR_WIDTH) : 0;
  return [seg("█".repeat(filled), "success"), seg("░".repeat(BAR_WIDTH - filled), "muted")];
}

/** "winget · scoop · pip +2" — the providers in flight, capped. */
function describeInFlight({ inFlight: names }: ScanState): string {
  const head = names.slice(0, MAX_IN_FLIGHT_SHOWN).join(" · ");
  const overflow = names.length - MAX_IN_FLIGHT_SHOWN;
  return overflow > 0 ? `${head} +${overflow}` : head;
}
