import { ScanPanel, type ScanEvents } from "../panels/scan-panel.js";
import { Chrome, CHROME_ROWS } from "../tui/chrome.js";
import { screenHost, type ScreenHost } from "../tui/screen-host.js";
import { PANEL_FRAME, TextPanel } from "../tui/text-panel.js";

const FRAME_MS = 100;

/**
 * Run `work` under a full-screen scan view, for the one-shot commands
 * (`gup list`, `gup update`). The screen closes when the work settles; the
 * caller prints whatever should stay in the scrollback.
 */
export function withScanScreen<T>(
  work: (events: ScanEvents) => Promise<T>,
  host: ScreenHost = screenHost,
): Promise<T> {
  return host.run(async (screen) => {
    const chrome = new Chrome(screen);
    const panel = new TextPanel(screen, chrome.body, { id: "gup-scan", title: "Scan" });
    const scan = new ScanPanel(() => {});
    const draw = (): void => {
      const { terminalWidth, terminalHeight } = screen.renderer;
      panel.show(
        scan.render({
          width: terminalWidth - PANEL_FRAME.cols,
          height: terminalHeight - CHROME_ROWS - PANEL_FRAME.rows,
        }),
      );
    };
    chrome.setHints("Ctrl+C interrompre");
    const timer = setInterval(() => {
      scan.tick();
      draw();
    }, FRAME_MS);
    draw();
    try {
      return await work(redrawing(scan, draw));
    } finally {
      clearInterval(timer);
    }
  });
}

/** The panel's own events, each followed by a redraw. */
function redrawing(scan: ScanPanel, draw: () => void): ScanEvents {
  return {
    detecting: () => (scan.detecting(), draw()),
    planned: (total) => (scan.planned(total), draw()),
    started: (name) => (scan.started(name), draw()),
    finished: (name, outcome) => (scan.finished(name, outcome), draw()),
    completed: (ms) => (scan.completed(ms), draw()),
  };
}
