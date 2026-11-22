import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { shouldAskConsent, type ConsentFacts } from "../../../src/commands/feedback/consent.js";
import {
  FeedbackCommands,
  type FeedbackCommandDeps,
} from "../../../src/commands/feedback/feedback-commands.js";
import {
  FeedbackLifecycle,
  type FeedbackLifecycleDeps,
} from "../../../src/commands/feedback/feedback-lifecycle.js";
import { SharingControl, type SharingDeps } from "../../../src/commands/feedback/sharing-control.js";
import type { FetchLike } from "../../../src/core/feedback/feedback-client.js";
import {
  IDENTITY_FILE,
  readInstallIdentity,
} from "../../../src/core/feedback/install-identity.js";
import { UploadCursorFile } from "../../../src/core/feedback/upload-cursor.js";
import { PromptCancelledError } from "../../../src/ui/tui/prompt-cancelled.js";
import { FEEDBACK_CLI_LABELS } from "../../../src/ui/text/feedback/feedback-cli-labels.js";
import { isSignedBy } from "../../support/feedback-signature.js";
import { useLocale } from "../../support/locale.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const ATTENDED: ConsentFacts = {
  commandPath: "update",
  options: {},
  env: {},
  state: "ask",
  canPrompt: true,
  canKeepAnswer: true,
};
const NOW = Date.parse("2026-11-20T12:00:00.000Z");
const SENT_AT = "2026-11-19T08:00:00.000Z";
const PRODUCTION = "https://gup.charles-lindecker.com";

describe("shouldAskConsent", () => {
  it.each(["", "update", "list"])("asks before %j while no answer is saved", (commandPath) => {
    expect(shouldAskConsent({ ...ATTENDED, commandPath })).toBe(true);
  });

  it.each([
    ["once answered yes", { state: "granted" }],
    ["once answered no", { state: "denied" }],
    ["when GUP_SHARE_LOGS turns sharing off", { state: "forced-off" }],
    ["without a terminal to ask in", { canPrompt: false }],
    ["in CI", { env: { CI: "true" } }],
    ["for a script reading JSON", { commandPath: "list", options: { json: true } }],
    ["for a run that answers yes to everything", { options: { yes: true } }],
    ["when the answer could not be kept", { canKeepAnswer: false }],
    ["before a command that writes no journal", { commandPath: "doctor" }],
    ["in the scheduler's tick", { commandPath: "__schedule-tick" }],
  ] as const)("never asks %s", (_case, over: Partial<ConsentFacts>) => {
    expect(shouldAskConsent({ ...ATTENDED, ...over })).toBe(false);
  });
});

describe("feedback sharing", () => {
  useLocale("fr");
  const tempDir = useTempDirs();

  async function sharingFor(over: Partial<SharingDeps> = {}) {
    const fetch = vi.fn<FetchLike>(async () => ({ status: 204 }));
    const dir = join(await tempDir("gup-feedback-"), "feedback");
    const sharing = new SharingControl({ env: {}, dir: () => dir, fetch, now: () => NOW, ...over });
    return { sharing, dir, fetch: (over.fetch as typeof fetch | undefined) ?? fetch };
  }

  function lifecycle(sharing: SharingControl, over: Partial<FeedbackLifecycleDeps> = {}) {
    return new FeedbackLifecycle({
      sharing: () => sharing,
      env: {},
      canPrompt: () => true,
      ask: vi.fn(async () => true),
      deadlineMs: 1_000,
      ...over,
    });
  }

  function commands(sharing: SharingControl, over: Partial<FeedbackCommandDeps> = {}) {
    const write = vi.fn<(text: string) => void>();
    const writeError = vi.fn<(text: string) => void>();
    const deps: FeedbackCommandDeps = {
      sharing: () => sharing,
      write,
      writeError,
      openPage: vi.fn(),
      isWatched: () => false,
      ...over,
    };
    return { commands: new FeedbackCommands(deps), write, writeError };
  }

  describe("the consent question", () => {
    it("is asked once, and a yes creates the install identity", async () => {
      const { sharing, dir } = await sharingFor();
      const ask = vi.fn(async () => true);
      const steps = lifecycle(sharing, { ask });

      expect(readInstallIdentity(dir)).toBeNull();
      await steps.askConsentOnce({ commandPath: "", options: {} });
      await steps.askConsentOnce({ commandPath: "update", options: {} });

      expect(ask).toHaveBeenCalledTimes(1);
      expect(sharing.state()).toBe("granted");
      expect(readInstallIdentity(dir)).not.toBeNull();
    });

    it("keeps a refusal without creating any identity", async () => {
      const { sharing, dir } = await sharingFor();
      const ask = vi.fn(async () => false);

      await lifecycle(sharing, { ask }).askConsentOnce({ commandPath: "list", options: {} });
      await lifecycle(sharing, { ask }).askConsentOnce({ commandPath: "list", options: {} });

      expect(ask).toHaveBeenCalledTimes(1);
      expect(sharing.state()).toBe("denied");
      expect(await readdir(dir)).not.toContain(IDENTITY_FILE);
    });

    it("saves no on Ctrl+C, then ends the run like every other prompt", async () => {
      const { sharing } = await sharingFor();
      const ask = vi.fn(() => Promise.reject(new PromptCancelledError()));

      await expect(
        lifecycle(sharing, { ask }).askConsentOnce({ commandPath: "", options: {} }),
      ).rejects.toBeInstanceOf(PromptCancelledError);
      expect(sharing.state()).toBe("denied");
    });

    it("lets the command go on, nothing saved, when the question fails otherwise", async () => {
      const { sharing } = await sharingFor();
      const ask = vi.fn(() => Promise.reject(new Error("no renderer")));

      await expect(
        lifecycle(sharing, { ask }).askConsentOnce({ commandPath: "", options: {} }),
      ).resolves.toBeUndefined();
      expect(sharing.state()).toBe("ask");
    });
  });

  describe("the decision", () => {
    it("lives in the machine-local state directory, not in config.json", async () => {
      const { sharing, dir } = await sharingFor();

      sharing.decide("denied");

      expect(JSON.parse(await readFile(join(dir, "sharing.json"), "utf8"))).toEqual({
        v: 1,
        decision: "denied",
      });
      expect(await readdir(dir)).not.toContain("config.json");
    });

    it("reads as ask when the file holds no valid answer", async () => {
      const { sharing } = await sharingFor({ dir: () => null });

      expect(sharing.state()).toBe("ask");
      expect(sharing.canKeepAnswer()).toBe(false);
      expect(() => sharing.decide("granted")).toThrow();
    });

    it("a yes after a no shares only from now on; a first yes keeps the 30-day reach", async () => {
      const first = await sharingFor();
      first.sharing.decide("granted");
      expect(new UploadCursorFile(first.dir).read().logs).toBeNull();

      const again = await sharingFor();
      again.sharing.decide("denied");
      again.sharing.decide("granted");
      const now = new Date(NOW).toISOString();
      expect(new UploadCursorFile(again.dir).read()).toMatchObject({
        history: { at: now, count: 0 },
        logs: { at: now, count: 0 },
      });
    });
  });

  describe("reading where sharing stands", () => {
    it("creates no identity: status, doctor, the Options hint", async () => {
      const { sharing, dir } = await sharingFor();
      const { commands: cli, write } = commands(sharing);

      expect(cli.status()).toBe(0);
      const line = lifecycle(sharing).diagnostic();

      expect(write).toHaveBeenCalledWith(expect.stringContaining(FEEDBACK_CLI_LABELS.idNotCreated));
      expect(line.value).toBe(
        FEEDBACK_CLI_LABELS.diagnosticNoId(FEEDBACK_CLI_LABELS.states.ask),
      );
      expect(sharing.installId()).toBeNull();
      await expect(readdir(dir)).rejects.toThrow();
    });

    it("gup feedback id creates it, and status shows it afterwards", async () => {
      const { sharing } = await sharingFor();
      const { commands: cli, write } = commands(sharing);

      expect(cli.id()).toBe(0);
      const installId = sharing.installId()!;
      cli.status();

      expect(write).toHaveBeenNthCalledWith(1, `${installId}\n`);
      expect(write).toHaveBeenLastCalledWith(
        expect.stringContaining(FEEDBACK_CLI_LABELS.installId(installId)),
      );
    });
  });

  describe("uploads", () => {
    it("send nothing while sharing is not granted", async () => {
      const { sharing, fetch } = await sharingFor();

      await sharing.upload();
      sharing.decide("denied");
      await sharing.upload();

      expect(fetch).not.toHaveBeenCalled();
    });

    it("send nothing under GUP_SHARE_LOGS=0, whatever the decision", async () => {
      const { sharing, fetch } = await sharingFor({ env: { GUP_SHARE_LOGS: "0" } });
      sharing.decide("granted");

      await sharing.upload();

      expect(sharing.state()).toBe("forced-off");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("go nowhere when GUP_FEEDBACK_API is refused, and say so", async () => {
      const env = { GUP_FEEDBACK_API: "http://staging.example.test" };
      const { sharing, fetch } = await sharingFor({ env });
      const { commands: cli, writeError } = commands(sharing);

      expect(await cli.share("on")).toBe(0);
      await sharing.upload();

      expect(fetch).not.toHaveBeenCalled();
      expect(writeError).toHaveBeenCalledWith(
        expect.stringContaining(FEEDBACK_CLI_LABELS.overrideRejected("GUP_FEEDBACK_API")),
      );
    });
  });

  describe("after a command", () => {
    it("uploads after the commands that write the journals, not after the others", async () => {
      const { sharing } = await sharingFor();
      const upload = vi.spyOn(sharing, "upload").mockResolvedValue();
      const steps = lifecycle(sharing);

      await steps.afterCommand({ commandPath: "doctor", options: {} });
      await steps.afterCommand({ commandPath: "update", options: {} });

      expect(upload).toHaveBeenCalledTimes(1);
    });

    it("gives up at its deadline", async () => {
      const { sharing } = await sharingFor();
      vi.spyOn(sharing, "upload").mockReturnValue(new Promise(() => undefined));
      const started = Date.now();

      await lifecycle(sharing, { deadlineMs: 50 }).afterCommand({ commandPath: "", options: {} });

      expect(Date.now() - started).toBeLessThan(1_000);
    });

    it("waits for an erasure the menu started before the process exits", async () => {
      let answer: (status: { status: number }) => void = () => undefined;
      const fetch = vi.fn<FetchLike>(() => new Promise((resolve) => (answer = resolve)));
      const { sharing } = await sharingFor({ fetch });
      sharing.createInstallId();
      const erasing = sharing.erase();
      let isDone = false;

      const ending = lifecycle(sharing)
        .afterCommand({ commandPath: "", options: {} })
        .then(() => (isDone = true));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(isDone).toBe(false);
      answer({ status: 204 });
      await ending;

      expect(await erasing).toBe("erased");
    });
  });

  describe("gup feedback share off", () => {
    it("saves the refusal, erases with a signed request, then forgets the cursor", async () => {
      const { sharing, dir, fetch } = await sharingFor();
      sharing.decide("granted");
      const identity = readInstallIdentity(dir)!;
      const cursor = new UploadCursorFile(dir);
      cursor.save({ history: null, logs: { at: SENT_AT, count: 1 }, lastUploadAt: SENT_AT });
      const { commands: cli, write } = commands(sharing);

      expect(await cli.share("off")).toBe(0);

      const url = `${PRODUCTION}/api/installs/${identity.installId}`;
      const [calledUrl, init] = fetch.mock.calls[0]!;
      const headers = init.headers as Record<string, string>;
      expect(sharing.state()).toBe("denied");
      expect(calledUrl).toBe(url);
      expect(init.method).toBe("DELETE");
      expect(isSignedBy({ authorization: headers["authorization"]!, method: "DELETE", url, body: "" }))
        .toBe(true);
      expect(cursor.read()).toEqual({ history: null, logs: null, lastUploadAt: null });
      expect(write).toHaveBeenCalledWith(`${FEEDBACK_CLI_LABELS.erasure.erased}\n`);
    });

    it.each([
      ["cannot be reached", () => Promise.reject(new TypeError("fetch failed"))],
      ["refuses", async () => ({ status: 503 })],
    ])("still turns sharing off when the service %s, and keeps the cursor", async (_case, impl) => {
      const fetch = vi.fn<FetchLike>(impl);
      const { sharing, dir } = await sharingFor({ fetch });
      sharing.decide("granted");
      const cursor = new UploadCursorFile(dir);
      cursor.save({ history: null, logs: { at: SENT_AT, count: 1 }, lastUploadAt: SENT_AT });
      const { commands: cli, write } = commands(sharing);

      expect(await cli.share("off")).toBe(0);

      expect(sharing.state()).toBe("denied");
      expect(cursor.read().logs).toEqual({ at: SENT_AT, count: 1 });
      expect(write).toHaveBeenCalledWith(`${FEEDBACK_CLI_LABELS.erasure.failed}\n`);
    });

    it("reports a failure when the identity exists but cannot be read", async () => {
      const { sharing, dir, fetch } = await sharingFor();
      await mkdir(join(dir, IDENTITY_FILE), { recursive: true });

      expect(await sharing.withdraw()).toBe("failed");
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
