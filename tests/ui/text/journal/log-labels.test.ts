import { describe, expect, it } from "vitest";
import type { SystemSnapshot } from "../../../../src/core/state/system-snapshot.js";
import { diagnosticReadme } from "../../../../src/ui/text/journal/log-labels.js";
import { useLocale } from "../../../support/locale.js";

const SYSTEM: SystemSnapshot = {
  gup: "0.5.0",
  node: "26.10.0",
  platform: "win32",
  arch: "x64",
  osRelease: "10.0.26200",
  tty: { stdin: true, stdout: true },
  env: {},
};

function readme(contents: { readonly logs: readonly string[]; readonly dropped: number }): string {
  return diagnosticReadme({ generatedAt: new Date("2026-10-03T12:00:00Z"), system: SYSTEM, ...contents });
}

describe("the diagnostic archive's README", () => {
  it("agrees with the number of lines left out and of log files", () => {
    const one = readme({ logs: ["gup-2026-10-03.jsonl"], dropped: 1 });
    expect(one).toContain("journal de debug, 1 fichier\n");
    expect(one).toContain("1 ligne illisible du journal a été omise.");
    const two = readme({ logs: ["gup-2026-10-02.jsonl", "gup-2026-10-03.jsonl"], dropped: 2 });
    expect(two).toContain("journal de debug, 2 fichiers\n");
    expect(two).toContain("2 lignes illisibles du journal ont été omises.");
  });

  it("says nothing of left-out lines when there are none", () => {
    expect(readme({ logs: [], dropped: 0 })).not.toContain("omise");
  });
});

describe("the diagnostic archive's README in English", () => {
  useLocale("en");

  it("lays its contents out under the same entries", () => {
    const text = readme({ logs: ["gup-2026-10-03.jsonl"], dropped: 2 });

    expect(text).toMatch(/^gup diagnostic archive\n\nGenerated on 2026-10-03T12:00:00\.000Z by gup 0\.5\.0\n/);
    expect(text).toContain(
      "Contents:\n" +
        "  system.json   versions, platform and gup's own environment variables\n" +
        "                (an allowlist: the rest of the environment is never copied)\n" +
        "  logs/         debug log, 1 file\n" +
        "                  gup-2026-10-03.jsonl\n",
    );
    expect(text).toMatch(/\n\n2 unreadable log lines were left out\.\n$/);
  });
});
