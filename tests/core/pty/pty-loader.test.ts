import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePty, type FakeHandle } from "../../support/pty/fake-pty.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";

/**
 * Whether installs can run in the embedded terminal: every step that can say
 * no, in order, with its French reason — and the default spawn probe against
 * an in-memory node-pty. The kill lever is replaced (no taskkill from a unit
 * test).
 */
const { ptyKillMock } = vi.hoisted(() => ({
  ptyKillMock: { terminate: vi.fn(async () => {}) },
}));
vi.mock("../../../src/core/pty/pty-kill.js", () => ({ ptyKill: ptyKillMock }));

import { PTY_LABELS } from "../../../src/core/pty/pty-labels.js";
import {
  detectEmbeddedTerminal,
  loadEmbeddedTerminal,
  NODE_PTY_PIN,
  PROBE_TIMEOUT_MS,
  type DetectionSteps,
} from "../../../src/core/pty/pty-loader.js";

const TRAMPOLINE = { script: "/opt/gup/dist/pty-exec.js", execArgv: [] };

// The fake handles carry no ConPTY internals: off Windows, nothing checks them.
beforeEach(() => setPlatform("linux"));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  restorePlatform();
});

/** Steps that all succeed, with a node-pty whose spawns exit as `exit` says. */
function passingSteps(overrides: Partial<DetectionSteps> = {}): DetectionSteps {
  const pty = fakePty();
  return {
    env: {},
    locate: () => TRAMPOLINE,
    importPty: async () => pty.module,
    prepareHelper: async () => null,
    probe: async () => null,
    ...overrides,
  };
}

function exitingPty(exitCode: number) {
  return fakePty({ onSpawn: (handle) => queueMicrotask(() => handle.emitExit({ exitCode })) });
}

describe("detectEmbeddedTerminal", () => {
  it.each(["0", "false", "OFF", " no "])("is off when GUP_PTY is %j", async (value) => {
    const importPty = vi.fn();
    const steps = passingSteps({ env: { GUP_PTY: value }, importPty });
    await expect(detectEmbeddedTerminal(steps)).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.disabled,
    });
    expect(importPty).not.toHaveBeenCalled();
  });

  it("needs the trampoline beside the CLI", async () => {
    const importPty = vi.fn();
    const support = await detectEmbeddedTerminal(passingSteps({ locate: () => null, importPty }));
    expect(support).toEqual({ isAvailable: false, reason: PTY_LABELS.missingTrampoline });
    expect(importPty).not.toHaveBeenCalled();
  });

  it.each([
    ["cannot be imported", () => Promise.reject(new Error("Cannot find package 'node-pty'"))],
    ["has no spawn function", () => Promise.resolve({ spawn: "nope" })],
    ["is nothing at all", () => Promise.resolve(undefined)],
  ])("reports node-pty absent when it %s", async (_label, importPty) => {
    await expect(detectEmbeddedTerminal(passingSteps({ importPty }))).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.missingModule,
    });
  });

  it("accepts node-pty's CommonJS namespace (spawn on the default export)", async () => {
    const pty = fakePty();
    const importPty = async () => ({ default: pty.module });
    const support = await detectEmbeddedTerminal(passingSteps({ importPty }));
    expect(support).toMatchObject({ isAvailable: true, trampoline: TRAMPOLINE });
  });

  it("stops on a spawn-helper it could not make executable", async () => {
    const probe = vi.fn();
    const support = await detectEmbeddedTerminal(
      passingSteps({ prepareHelper: async () => "/n/prebuilds/darwin-arm64/spawn-helper", probe }),
    );
    expect(support).toEqual({
      isAvailable: false,
      reason: PTY_LABELS.spawnHelper("/n/prebuilds/darwin-arm64/spawn-helper"),
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("reports why the probe failed", async () => {
    const probe = async () => "code de sortie 3";
    const support = await detectEmbeddedTerminal(passingSteps({ probe }));
    expect(support).toEqual({
      isAvailable: false,
      reason: "échec du test du pseudo-terminal : code de sortie 3",
    });
  });

  it("hands over node-pty and the trampoline when every step passed", async () => {
    const pty = fakePty();
    const importPty = async () => pty.module;
    const support = await detectEmbeddedTerminal(passingSteps({ importPty }));
    if (!support.isAvailable) throw new Error(support.reason);
    expect(support.trampoline).toBe(TRAMPOLINE);
    support.pty.spawn("node", ["x"], { name: "xterm-256color", cols: 80, rows: 24 });
    expect(pty.spawned).toHaveLength(1);
  });
});

describe("detectEmbeddedTerminal: the default probe", () => {
  const probeSteps = (importPty: DetectionSteps["importPty"]) => {
    const { probe: _replaced, ...steps } = passingSteps({ importPty });
    return steps;
  };

  it("runs `node -e \"\"` in a small terminal and passes on exit 0", async () => {
    const pty = exitingPty(0);
    const support = await detectEmbeddedTerminal(probeSteps(async () => pty.module));
    expect(support.isAvailable).toBe(true);
    expect(pty.spawned[0]).toMatchObject({ file: process.execPath, args: ["-e", ""] });
  });

  it("fails on another exit code", async () => {
    const pty = exitingPty(3);
    await expect(detectEmbeddedTerminal(probeSteps(async () => pty.module))).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.probeFailed(PTY_LABELS.probeExitCode(3)),
    });
  });

  it("fails, and kills the child, when it does not answer in time", async () => {
    vi.useFakeTimers();
    const pty = fakePty({ pid: 77 });
    const support = detectEmbeddedTerminal(probeSteps(async () => pty.module));
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await expect(support).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.probeFailed(PTY_LABELS.probeTimeout(PROBE_TIMEOUT_MS / 1000)),
    });
    expect(ptyKillMock.terminate).toHaveBeenCalledWith(77);
  });

  it("fails when spawning throws", async () => {
    const pty = fakePty({ spawnError: new Error("posix_spawnp failed.") });
    await expect(detectEmbeddedTerminal(probeSteps(async () => pty.module))).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.probeFailed("posix_spawnp failed."),
    });
  });

  it("refuses, on Windows, a node-pty whose handles it could not release", async () => {
    setPlatform("win32");
    let spawnedHandle: FakeHandle | undefined;
    const pty = fakePty({ pid: 88, onSpawn: (handle) => (spawnedHandle = handle) });
    await expect(detectEmbeddedTerminal(probeSteps(async () => pty.module))).resolves.toEqual({
      isAvailable: false,
      reason: PTY_LABELS.probeFailed(PTY_LABELS.unexpectedInternals(NODE_PTY_PIN)),
    });
    expect(spawnedHandle).toBeDefined();
    expect(ptyKillMock.terminate).toHaveBeenCalledWith(88);
  });
});

describe("loadEmbeddedTerminal", () => {
  it("detects once per process", async () => {
    vi.stubEnv("GUP_PTY", "off");
    const first = loadEmbeddedTerminal();
    expect(loadEmbeddedTerminal()).toBe(first);
    await expect(first).resolves.toEqual({ isAvailable: false, reason: PTY_LABELS.disabled });
  });
});

describe("node-pty pin", () => {
  it("is the exact version package.json installs (releaseConpty relies on it)", async () => {
    const manifest = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      optionalDependencies?: Record<string, string>;
    };
    expect(manifest.optionalDependencies?.["node-pty"]).toBe(NODE_PTY_PIN);
  });
});
