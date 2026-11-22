import type { InstallSummary } from "../../../ports/install-reader.js";
import type { AdminContext } from "../admin-context.js";

/** Bumped when a line's shape changes in a way a reader of version 1 would misread. */
const EXPORT_FORMAT = { name: "gup-install-export", version: 1 } as const;

export interface InstallExportInput {
  readonly context: AdminContext;
  readonly install: InstallSummary;
  readonly exportedAt: Date;
}

function line(type: string, value: object): string {
  return `${JSON.stringify({ type, ...value })}\n`;
}

/**
 * Everything stored for one install as JSON Lines: a header, the install,
 * its feedback, then its history and log oldest first. The journals are read
 * in chunks as the response drains, so a large install never sits in memory.
 */
export async function* installExport(input: InstallExportInput): AsyncGenerator<string> {
  const { context, install } = input;
  yield line("export", {
    format: EXPORT_FORMAT.name, version: EXPORT_FORMAT.version, exportedAt: input.exportedAt,
    retentionDays: context.config.logRetentionDays,
  });
  yield line("install", install);
  for (const feedback of await context.feedback.listByInstall(install.id)) {
    yield line("feedback", feedback);
  }
  for await (const record of context.journals.streamHistory(install.id)) {
    yield line("history", record);
  }
  for await (const record of context.journals.streamLogs(install.id)) yield line("log", record);
}
