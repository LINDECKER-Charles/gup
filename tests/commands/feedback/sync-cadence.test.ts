import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FeedbackCommands } from "../../../src/commands/feedback/feedback-commands.js";
import { FeedbackLifecycle } from "../../../src/commands/feedback/feedback-lifecycle.js";
import { SharingControl } from "../../../src/commands/feedback/sharing-control.js";
import type { FetchLike } from "../../../src/core/feedback/feedback-client.js";
import { UploadCursorFile } from "../../../src/core/feedback/upload-cursor.js";
import { FEEDBACK_CLI_LABELS as LABELS } from "../../../src/ui/text/feedback/feedback-cli-labels.js";
import { updateEvent, writeHistoryShards } from "../../support/history-fixtures.js";
import { useLocale } from "../../support/locale.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const DAY_MS = 86_400_000;
const EMPTY = { history: null, logs: null, lastUploadAt: null, lastSyncAt: null };
const LOGS_ROUTE = /\/api\/installs\/[^/]+\/logs$/;

describe("the weekly sync of the shared journals", () => {
  useLocale("fr");
  const tempDir = useTempDirs();

  /** Sharing on, one history record to send, and the last sync completed `syncedDaysAgo` ago. */
  async function granted(syncedDaysAgo: number | null) {
    const root = await tempDir("gup-sync-");
    const dir = join(root, "feedback");
    vi.stubEnv("GUP_HISTORY_DIR", join(root, "history"));
    vi.stubEnv("GUP_LOG_DIR", join(root, "logs"));
    await writeHistoryShards(join(root, "history"), [
      updateEvent("winget", "Git.Git", { ts: new Date(NOW - 2 * DAY_MS).toISOString() }),
    ]);
    const fetch = vi.fn<FetchLike>(async () => ({ status: 202 }));
    const sharing = new SharingControl({ env: {}, dir: () => dir, fetch, now: () => NOW });
    sharing.decide("granted");
    const lastSyncAt = syncedDaysAgo === null ? null : iso(NOW - syncedDaysAgo * DAY_MS);
    new UploadCursorFile(dir).save({ ...EMPTY, lastSyncAt });
    return { sharing, fetch, dir };
  }

  function lifecycle(sharing: SharingControl) {
    return new FeedbackLifecycle({
      sharing: () => sharing,
      env: {},
      canPrompt: () => false,
      ask: vi.fn(async () => false),
      deadlineMs: 5_000,
    });
  }

  function cli(sharing: SharingControl) {
    const write = vi.fn<(text: string) => void>();
    const commands = new FeedbackCommands({
      sharing: () => sharing,
      write,
      writeError: vi.fn(),
      openPage: vi.fn(),
      isWatched: () => false,
    });
    return { commands, write };
  }

  const uploads = (fetch: ReturnType<typeof vi.fn<FetchLike>>) =>
    fetch.mock.calls.filter(([url]) => LOGS_ROUTE.test(url));

  it("sends nothing after an update within a week of the last completed sync", async () => {
    const { sharing, fetch } = await granted(6);

    await lifecycle(sharing).afterCommand({ commandPath: "update", options: {} });

    expect(uploads(fetch)).toHaveLength(0);
  });

  it("syncs after an update once the week is over, and starts the next week", async () => {
    const { sharing, fetch, dir } = await granted(7);

    await lifecycle(sharing).afterCommand({ commandPath: "update", options: {} });

    expect(uploads(fetch)).toHaveLength(1);
    expect(new UploadCursorFile(dir).read().lastSyncAt).toBe(iso(NOW));
  });

  it("syncs at the exit of gup feedback, whatever the week says", async () => {
    const { sharing, fetch } = await granted(1);
    const { commands } = cli(sharing);

    expect(await commands.form(false)).toBe(0);
    await lifecycle(sharing).afterCommand({ commandPath: "feedback", options: {} });

    expect(uploads(fetch)).toHaveLength(1);
  });

  it("syncs at the end of a menu session in which the form was opened", async () => {
    const { sharing, fetch } = await granted(1);

    sharing.requestSync();
    await lifecycle(sharing).afterCommand({ commandPath: "", options: {} });

    expect(uploads(fetch)).toHaveLength(1);
    expect(sharing.isSyncRequested()).toBe(false);
  });

  it("uploads nothing after a feedback command that did not show the form", async () => {
    const { sharing, fetch } = await granted(null);
    cli(sharing).commands.status();

    await lifecycle(sharing).afterCommand({ commandPath: "feedback status", options: {} });

    expect(uploads(fetch)).toHaveLength(0);
  });

  describe("gup feedback status", () => {
    it("shows when the next sync is due", async () => {
      const { sharing } = await granted(2);
      const { commands, write } = cli(sharing);

      commands.status();

      expect(write).toHaveBeenCalledWith(
        expect.stringContaining(LABELS.nextSync(iso(NOW + 5 * DAY_MS))),
      );
    });

    it("says the next run syncs when one is due", async () => {
      const { sharing } = await granted(null);
      const { commands, write } = cli(sharing);

      commands.status();

      expect(write).toHaveBeenCalledWith(expect.stringContaining(LABELS.nextSyncNow));
    });

    it("says nothing of the next sync while sharing is off", async () => {
      const { sharing } = await granted(null);
      sharing.decide("denied");
      const { commands, write } = cli(sharing);

      commands.status();

      expect(write).not.toHaveBeenCalledWith(expect.stringContaining(LABELS.nextSyncNow));
    });
  });
});

function iso(at: number): string {
  return new Date(at).toISOString();
}
