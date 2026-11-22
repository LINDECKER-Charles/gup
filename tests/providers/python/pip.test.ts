import { describe, expect, it } from "vitest";
import { PipProvider } from "../../../src/providers/python/pip.js";
import { SYSTEM_SITE_PROBE } from "../../../src/providers/python/system-site-probe.js";
import { useLocale } from "../../support/locale.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandScript, SystemSpec } from "../../support/system/types.js";
import { installArgvs } from "../../support/system/trace.js";
import { PIP_INSTALL_ARGS } from "./python.cases.js";

/**
 * pip upgrades a package without asking the packages that depend on it, and
 * exits 0: what a real run did to semgrep (which pins click~=8.4.2) and to
 * pydantic (which pins pydantic-core exactly).
 */

const CHECK_ARGV = ["pip", "check", "--disable-pip-version-check"];
const HEALTHY = "No broken requirements found.\n";
const SEMGREP_BROKEN =
  "semgrep 1.178.0 has requirement click~=8.4.2, but you have click 8.5.0.\n";
const PYDANTIC_BROKEN =
  "pydantic 2.13.5 has requirement pydantic-core==2.46.5, but you have pydantic-core 2.49.0.\n";

function show(name: string, version: string): CommandScript {
  return {
    argv: ["pip", "show", "--disable-pip-version-check", name],
    stdout: `Name: ${name}\nVersion: ${version}\n`,
  };
}

/** A Windows pip whose `pip check` reports `before`, then `after` once an install ran. */
function machine(before: string, after: string, probes: readonly CommandScript[]): SystemSpec {
  return {
    platform: "win32",
    bin: { pip: "C:\\Python313\\Scripts\\pip.exe" },
    commands: [
      ...probes,
      { argv: CHECK_ARGV, stdout: before, afterInstall: { stdout: after, exitCode: 1 } },
    ],
  };
}

const restore = (spec: string): string[] => [
  "pip",
  "install",
  "--user",
  "--disable-pip-version-check",
  spec,
];

describe("PipProvider.update", () => {
  it("keeps an upgrade that breaks nothing", async () => {
    await system.load(machine(HEALTHY, HEALTHY, [show("rich", "13.0.0")]));
    await expect(new PipProvider().update("rich")).resolves.toEqual({ id: "rich", success: true });
    expect(installArgvs()).toEqual([["pip", ...PIP_INSTALL_ARGS, "rich"]]);
  });

  it("puts the previous version back when the upgrade breaks a package that depends on it", async () => {
    await system.load(machine(HEALTHY, SEMGREP_BROKEN, [show("click", "8.4.2")]));
    const outcome = await new PipProvider().update("click");
    expect(installArgvs()).toEqual([["pip", ...PIP_INSTALL_ARGS, "click"], restore("click==8.4.2")]);
    expect(outcome).toEqual({
      id: "click",
      success: false,
      skipped: true,
      message: "click 8.5.0 casserait semgrep 1.178.0 (click~=8.4.2) : retour à 8.4.2",
    });
  });

  it("matches the package however pip spells it (pydantic_core is pydantic-core)", async () => {
    await system.load(machine(HEALTHY, PYDANTIC_BROKEN, [show("pydantic_core", "2.46.5")]));
    const outcome = await new PipProvider().update("pydantic_core");
    expect(outcome).toMatchObject({ success: false, skipped: true });
    expect(installArgvs().at(-1)).toEqual(restore("pydantic_core==2.46.5"));
  });

  it("does not blame the upgrade for a requirement that was already broken", async () => {
    await system.load(machine(SEMGREP_BROKEN, SEMGREP_BROKEN, [show("click", "8.5.0")]));
    await expect(new PipProvider().update("click")).resolves.toEqual({ id: "click", success: true });
    expect(installArgvs()).toHaveLength(1);
  });

  it("fails, saying so, when the previous version cannot be put back", async () => {
    await system.load(machine(HEALTHY, SEMGREP_BROKEN, [show("click", "8.4.2")]));
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    const outcome = await new PipProvider().update("click");
    expect(outcome).toEqual({
      id: "click",
      success: false,
      message: "click 8.5.0 casse semgrep 1.178.0 (click~=8.4.2), et le retour à 8.4.2 a échoué",
    });
  });
});

describe("PipProvider.updateAll", () => {
  it("upgrades the batch at once, then undoes only the upgrade that broke a dependent", async () => {
    await system.load(machine(HEALTHY, SEMGREP_BROKEN, []));
    const outcomes = await new PipProvider().updateAll([
      { id: "click", current: "8.4.2", latest: "8.5.0" },
      { id: "rich", current: "13.0.0", latest: "13.7.1" },
    ]);
    expect(installArgvs()).toEqual([
      ["pip", ...PIP_INSTALL_ARGS, "click", "rich"],
      restore("click==8.4.2"),
    ]);
    expect(outcomes).toEqual([
      expect.objectContaining({ id: "click", success: false, skipped: true }),
      { id: "rich", success: true },
    ]);
  });
});

describe("PipProvider in English", () => {
  useLocale("en");

  it("says which dependent the upgrade would break, and what it went back to", async () => {
    await system.load(machine(HEALTHY, SEMGREP_BROKEN, [show("click", "8.4.2")]));
    const outcome = await new PipProvider().update("click");
    expect(outcome.message).toBe(
      "click 8.5.0 would break semgrep 1.178.0 (click~=8.4.2): back to 8.4.2",
    );
  });
});

// --- a Python installed in a folder of the user's ------------------------------------

const PYTHON = "F:\\Python313\\python.exe";
const SITE = "F:\\Python313\\Lib\\site-packages";
const LIST_TAIL = ["--format=json", "--disable-pip-version-check"];
const NUMPY_BROKEN =
  "opencv-python 4.13.0 has requirement numpy<2.5, but you have numpy 2.5.3.\n";

/** `pip list` rows for `names`, as pip prints them. */
function rows(...names: string[]): string {
  return JSON.stringify(names.map((name) => ({ name, version: "1.0.0" })));
}

/**
 * pip on a Python whose site-packages the probe reports as `owned` (the
 * user's to write), holding numpy and opentelemetry-proto; click is in both
 * sites, mcp in the user site only.
 */
function ownedPython(owned: readonly string[], commands: readonly CommandScript[]): SystemSpec {
  return {
    platform: "win32",
    bin: { pip: "F:\\Python313\\Scripts\\pip.exe" },
    fs: { [PYTHON]: { kind: "file", executable: true } },
    commands: [
      { argv: [PYTHON, "-I", "-c", SYSTEM_SITE_PROBE], stdout: JSON.stringify(owned) },
      { argv: ["pip", "list", "--user", ...LIST_TAIL], stdout: rows("click", "mcp") },
      {
        argv: ["pip", "list", "--path", SITE, ...LIST_TAIL],
        stdout: rows("click", "numpy", "opentelemetry-proto"),
      },
      ...commands,
    ],
  };
}

const upgrade = (...specs: string[]): string[] => [
  "pip",
  "install",
  "--upgrade",
  "--disable-pip-version-check",
  ...specs,
];

describe("PipProvider on a Python installed in a folder of the user's", () => {
  it("lists the outdated packages of both sites, and only theirs", async () => {
    const outdated = JSON.stringify(
      ["click", "opentelemetry_proto", "numpy", "python-apt"].map((name) => ({
        name,
        version: "1.0.0",
        latest_version: "2.0.0",
      })),
    );
    await system.load(
      ownedPython([SITE], [{ argv: ["pip", "list", "--outdated", ...LIST_TAIL], stdout: outdated }]),
    );
    const listed = await new PipProvider().listOutdated();
    expect(listed.map((p) => p.id)).toEqual(["click", "opentelemetry_proto", "numpy"]);
  });

  it("keeps to the user site when the interpreter's own is not the user's to write", async () => {
    const outdated = JSON.stringify([{ name: "mcp", version: "1.0.0", latest_version: "2.0.0" }]);
    const userListing = ["pip", "list", "--outdated", "--user", ...LIST_TAIL];
    await system.load(ownedPython([], [{ argv: userListing, stdout: outdated }]));
    const listed = await new PipProvider().listOutdated();
    expect(listed.map((p) => p.id)).toEqual(["mcp"]);
  });

  it("upgrades a package of the interpreter's site there, and puts it back there", async () => {
    await system.load(
      ownedPython(
        [SITE],
        [
          show("numpy", "2.3.2"),
          { argv: CHECK_ARGV, stdout: HEALTHY, afterInstall: { stdout: NUMPY_BROKEN, exitCode: 1 } },
        ],
      ),
    );
    const outcome = await new PipProvider().update("numpy");
    expect(installArgvs()).toEqual([
      upgrade("numpy"),
      ["pip", "install", "--disable-pip-version-check", "numpy==2.3.2"],
    ]);
    expect(outcome).toMatchObject({ success: false, skipped: true });
  });

  it("upgrades in the user site a package found in both, the copy Python imports", async () => {
    await system.load(
      ownedPython([SITE], [show("click", "8.4.2"), { argv: CHECK_ARGV, stdout: HEALTHY }]),
    );
    await expect(new PipProvider().update("click")).resolves.toEqual({ id: "click", success: true });
    expect(installArgvs()).toEqual([["pip", ...PIP_INSTALL_ARGS, "click"]]);
  });

  it("upgrades a batch with one pip install per site, its outcomes in the batch's order", async () => {
    await system.load(ownedPython([SITE], [{ argv: CHECK_ARGV, stdout: HEALTHY }]));
    system.answerInstall({ exitCode: 0 }, { exitCode: 1 });
    const outcomes = await new PipProvider().updateAll([
      { id: "click", current: "8.4.2", latest: "8.5.0" },
      { id: "numpy", current: "2.3.2", latest: "2.5.3" },
      { id: "mcp", current: "1.29.0", latest: "2.3.0" },
    ]);
    expect(installArgvs()).toEqual([
      ["pip", ...PIP_INSTALL_ARGS, "click", "mcp"],
      upgrade("numpy"),
    ]);
    expect(outcomes).toEqual([
      { id: "click", success: true },
      { id: "numpy", success: false },
      { id: "mcp", success: true },
    ]);
  });
});
