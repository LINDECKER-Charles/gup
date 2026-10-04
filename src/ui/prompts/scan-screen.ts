import { uiPreferences } from "../app/ui-preferences.js";
import { ScanPanel, type ScanEvents } from "../panels/scan-panel.js";
import { SCAN_LABELS } from "../text/scan-labels.js";
import { bodyPanelSize, Chrome } from "../tui/chrome.js";
import { screenHost, type ScreenHost } from "../tui/screen-host.js";
import { TextPanel } from "../tui/text-panel.js";

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
    const scan = new ScanPanel(() => {});
    const panel = new TextPanel(screen, chrome.body, { id: "gup-scan", title: scan.title });
    const draw = (): void => panel.show(scan.render(bodyPanelSize(screen)));
    chrome.setHints(SCAN_LABELS.screenHints);
    const timer = setInterval(() => {
      // Animations off: the spinner stands still, the progress still redraws.
      if (uiPreferences().current().animations) scan.tick();
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
