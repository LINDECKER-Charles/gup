import type { InstallSummary } from "../../../ports/install-reader.js";

/** An install as tools return it: plain JSON, ISO 8601 dates. */
export const INSTALL_JSON = {
  summary: (install: InstallSummary) => ({
    ...install,
    firstSeenAt: install.firstSeenAt.toISOString(),
    lastSeenAt: install.lastSeenAt.toISOString(),
  }),

  /** One line: `<id> gup 0.6.0 win32/x64 last upload … — 12 history, 340 logs, 1 feedback`. */
  line: (install: InstallSummary): string => {
    const platform = [install.platform, install.arch].filter((part) => part !== null).join("/");
    return `${install.id} gup ${install.gupVersion ?? "?"} ${platform || "?"} `
      + `last upload ${install.lastSeenAt.toISOString()} — ${install.historyCount} history, `
      + `${install.logCount} logs, ${install.feedbackCount} feedback`;
  },
} as const;
