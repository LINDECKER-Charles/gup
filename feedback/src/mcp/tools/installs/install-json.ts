import type { McpPermission } from "../../../domain/mcp-access.js";
import type { InstallSummary } from "../../../ports/install-reader.js";

/** How many feedback gave the install ID is feedback data: null without `feedback:read`. */
function feedbackCountOf(install: InstallSummary, permissions: ReadonlySet<McpPermission>) {
  return permissions.has("feedback:read") ? install.feedbackCount : null;
}

/** An install as tools return it: plain JSON, ISO 8601 dates. */
export const INSTALL_JSON = {
  summary: (install: InstallSummary, permissions: ReadonlySet<McpPermission>) => ({
    ...install,
    feedbackCount: feedbackCountOf(install, permissions),
    firstSeenAt: install.firstSeenAt.toISOString(),
    lastSeenAt: install.lastSeenAt.toISOString(),
  }),

  /** One line: `<id> gup 0.6.0 win32/x64 last upload … — 12 history, 340 logs, 1 feedback`. */
  line: (install: InstallSummary, permissions: ReadonlySet<McpPermission>): string => {
    const platform = [install.platform, install.arch].filter((part) => part !== null).join("/");
    const feedbackCount = feedbackCountOf(install, permissions);
    return `${install.id} gup ${install.gupVersion ?? "?"} ${platform || "?"} `
      + `last upload ${install.lastSeenAt.toISOString()} — ${install.historyCount} history, `
      + `${install.logCount} logs${feedbackCount === null ? "" : `, ${feedbackCount} feedback`}`;
  },
} as const;
