import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { systemSnapshot } from "../../../src/core/state/system-snapshot.js";
import { gupVersion } from "../../../src/core/version.js";

describe("systemSnapshot", () => {
  it("describes gup, Node and the platform", () => {
    const snapshot = systemSnapshot({});
    expect(snapshot).toMatchObject({
      gup: gupVersion(),
      node: process.version,
      platform: process.platform,
      tty: { stdin: expect.any(Boolean), stdout: expect.any(Boolean) },
      env: {},
    });
    expect(snapshot.arch).not.toBe("");
    expect(snapshot.osRelease).not.toBe("");
  });

  it("copies only the allowlisted variables, redacted, and only the presence of opaque ids", () => {
    const env = {
      GUP_LOG_LEVEL: "debug",
      GUP_LOG_DIR: join(homedir(), "gup-logs"),
      TERM: "xterm-256color",
      WT_SESSION: "3c6c2e3c-0000-4000-8000-000000000000",
      GITHUB_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      HTTPS_PROXY: "http://bob:pw@proxy:8080",
      PATH: "/usr/bin",
      USERNAME: "dana",
    };
    expect(systemSnapshot(env).env).toEqual({
      GUP_LOG_LEVEL: "debug",
      GUP_LOG_DIR: join("~", "gup-logs"),
      TERM: "xterm-256color",
      WT_SESSION: "present",
    });
  });
});
