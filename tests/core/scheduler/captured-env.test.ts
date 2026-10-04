import { describe, expect, it } from "vitest";
import {
  applyCapturedEnv,
  captureEnv,
} from "../../../src/core/scheduler/trigger/captured-env.js";

const shell = {
  PATH: "/opt/homebrew/bin:/usr/bin:/bin",
  HOMEBREW_PREFIX: "/opt/homebrew",
  NVM_DIR: "/Users/a/.nvm",
  GUP_LOG_LEVEL: "debug",
  GUP_SCHEDULER_DIR: "/tmp/sandbox",
  GUP_NONINTERACTIVE: "1",
  GITHUB_TOKEN: "ghp_secret",
  AWS_SECRET_ACCESS_KEY: "secret",
  NPM_TOKEN: "secret",
  HOME: "/Users/a",
  EVIL: "x",
};

describe("captureEnv", () => {
  it("keeps the allowlisted variables and gup's own settings, nothing else", () => {
    expect(captureEnv(shell, "darwin")).toEqual({
      GUP_LOG_LEVEL: "debug",
      HOMEBREW_PREFIX: "/opt/homebrew",
      NVM_DIR: "/Users/a/.nvm",
      PATH: "/opt/homebrew/bin:/usr/bin:/bin",
    });
  });

  it("never captures credentials, whatever the shell holds", () => {
    const captured = captureEnv(shell, "linux");
    for (const secret of ["GITHUB_TOKEN", "AWS_SECRET_ACCESS_KEY", "NPM_TOKEN"]) {
      expect(captured).not.toHaveProperty(secret);
    }
  });

  it("drops values holding control characters", () => {
    expect(captureEnv({ PATH: "/bin\n/evil" }, "linux")).toEqual({});
  });

  it("captures nothing on Windows, where the task gets the user's environment", () => {
    expect(captureEnv(shell, "win32")).toEqual({});
  });
});

describe("applyCapturedEnv", () => {
  it("sets the captured variables, refusing names and values a record should never hold", () => {
    const target: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    applyCapturedEnv(
      { PATH: "/opt/homebrew/bin:/usr/bin", LD_PRELOAD: "/tmp/x.so", JAVA_HOME: "/j\u0007" },
      target,
    );
    expect(target).toEqual({ PATH: "/opt/homebrew/bin:/usr/bin" });
  });
});
