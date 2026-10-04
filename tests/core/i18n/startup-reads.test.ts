import { describe, expect, it, vi } from "vitest";

/**
 * The guard behind `locale.ts`'s rule: no module reads localized text while
 * it loads. Every module of the command line is evaluated before startup
 * chooses the language, so a label captured then (a module-level constant, a
 * provider field initialised at construction) would stay in English for a
 * French user. A fresh module graph is loaded with no language chosen yet,
 * and every read the locale saw is a failure, with the stack that names the
 * module.
 */
describe("startup", () => {
  it("reads no localized text while the command line's modules load", async () => {
    vi.resetModules();
    const { localeReadsBeforeStartup } = await import("../../../src/core/i18n/locale.js");
    await import("../../../src/commands/cli/cli-modules.js");
    await import("../../../src/commands/menu-views.js");
    await import("../../../src/core/registry.js");
    expect(localeReadsBeforeStartup()).toEqual([]);
  });
});
