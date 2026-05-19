import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock } = vi.hoisted(() => ({
  commandExistsMock: vi.fn(),
  runMock: vi.fn(),
  runInheritMock: vi.fn(),
}));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: vi.fn(),
  whichFirst: vi.fn(),
}));

const {
  delegateUpdateMock,
  detectInstallSourceMock,
  describeSourceMock,
  runPmUpdateMock,
} = vi.hoisted(() => ({
  delegateUpdateMock: vi.fn(),
  detectInstallSourceMock: vi.fn(),
  describeSourceMock: vi.fn(),
  runPmUpdateMock: vi.fn(),
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
  runPmUpdate: runPmUpdateMock,
  inferSourceFromPath: vi.fn(),
}));

const { fetchGitHubReleaseLatestMock } = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: vi.fn(),
  normalizeVersion: vi.fn((v: string) => v),
}));

import { AzProvider } from "../../src/providers/cloud/az.js";
import { AwsCliV2Provider } from "../../src/providers/cloud/aws-cli-v2.js";
import { DoctlProvider } from "../../src/providers/cloud/doctl.js";
import { FlyctlProvider } from "../../src/providers/cloud/flyctl.js";
import { GcloudProvider } from "../../src/providers/cloud/gcloud.js";
import { HcloudProvider } from "../../src/providers/cloud/hcloud.js";
import { HerokuProvider } from "../../src/providers/cloud/heroku.js";
import { LinodeCliProvider } from "../../src/providers/cloud/linode-cli.js";
import { OciCliProvider } from "../../src/providers/cloud/oci-cli.js";
import { RailwayProvider } from "../../src/providers/cloud/railway.js";
import { ScwProvider } from "../../src/providers/cloud/scw.js";
import { SupabaseProvider } from "../../src/providers/cloud/supabase.js";

function mkRun(stdout: string, failed = false, stderr = "") {
  return { stdout, stderr, exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ----------------------------- AzProvider -----------------------------------
describe("AzProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new AzProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new AzProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when stdout is empty/whitespace", async () => {
    runMock.mockResolvedValueOnce(mkRun("   "));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is not valid JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json {"));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when azure-cli field missing", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({})));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ "azure-cli": "2.50.0" })));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ "azure-cli": "2.50.0" })));
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when info.version missing", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ "azure-cli": "2.50.0" })));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ "azure-cli": "2.55.0" })));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "2.55.0" } }));
    await expect(new AzProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({ "azure-cli": "2.50.0" })));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "2.55.0" } }));
    const rows = await new AzProvider().listOutdated();
    expect(rows).toEqual([
      { id: "az", name: "Azure CLI", current: "2.50.0", latest: "2.55.0" },
    ]);
  });

  it("update runs az upgrade --yes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AzProvider().update("az");
    expect(res).toEqual({ id: "az", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("az", ["upgrade", "--yes"]);
  });

  it("update returns failure when runInherit failed", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new AzProvider().update("az");
    expect(res).toEqual({ id: "az", success: false });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new AzProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll triggers update once when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new AzProvider().updateAll([
      { id: "az", name: "Azure CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "az", success: true }]);
  });
});

// --------------------------- AwsCliV2Provider -------------------------------
describe("AwsCliV2Provider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new AwsCliV2Provider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new AwsCliV2Provider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new AwsCliV2Provider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no aws-cli/X pattern is present", async () => {
    runMock.mockResolvedValueOnce(mkRun("unknown output"));
    await expect(new AwsCliV2Provider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("aws-cli/2.15.30 Python/3.11"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new AwsCliV2Provider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("aws-cli/2.15.30 Python"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.15.30");
    await expect(new AwsCliV2Provider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row with note for non-manual sources", async () => {
    runMock.mockResolvedValueOnce(mkRun("", false, "aws-cli/2.15.30 Python")); // from stderr
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.16.0");
    detectInstallSourceMock.mockResolvedValueOnce("winget");
    describeSourceMock.mockReturnValueOnce("via winget");
    const rows = await new AwsCliV2Provider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "aws-cli-v2",
      name: "AWS CLI v2",
      current: "2.15.30",
      latest: "2.16.0",
      note: "via winget",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("aws-cli/2.15.30"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.16.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new AwsCliV2Provider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with the correct package ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "aws-cli-v2", success: true });
    await new AwsCliV2Provider().update("aws-cli-v2");
    const arg = delegateUpdateMock.mock.calls[0]![0];
    expect(arg).toMatchObject({
      id: "aws-cli-v2",
      binary: "aws",
      packageIds: { scoop: "aws", choco: "awscli", winget: "Amazon.AWSCLI" },
    });
    expect(arg.manualMessage).toMatch(/AWSCLIV2\.msi/i);
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new AwsCliV2Provider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll forwards via delegateUpdate", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "aws-cli-v2", success: false });
    const res = await new AwsCliV2Provider().updateAll([
      { id: "aws-cli-v2", name: "AWS CLI v2", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "aws-cli-v2", success: false }]);
  });
});

// ----------------------------- DoctlProvider -------------------------------
describe("DoctlProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new DoctlProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new DoctlProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new DoctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("totally unrelated"));
    await expect(new DoctlProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("doctl version 1.110.0-release"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new DoctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("doctl version 1.110.0-release"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.110.0");
    await expect(new DoctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("doctl version 1.110.0-release"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.111.0");
    detectInstallSourceMock.mockResolvedValueOnce("choco");
    describeSourceMock.mockReturnValueOnce("via choco");
    const rows = await new DoctlProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "doctl",
      current: "1.110.0",
      latest: "1.111.0",
      note: "via choco",
    });
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("doctl version 1.110.0-release"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.111.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new DoctlProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with the right ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "doctl", success: true });
    await new DoctlProvider().update("doctl");
    expect(delegateUpdateMock.mock.calls[0]![0]).toMatchObject({
      id: "doctl",
      binary: "doctl",
      packageIds: { scoop: "doctl", choco: "doctl", winget: "DigitalOcean.Doctl" },
    });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new DoctlProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll delegates when packages present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "doctl", success: true });
    const res = await new DoctlProvider().updateAll([
      { id: "doctl", name: "doctl", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "doctl", success: true }]);
  });
});

// ----------------------------- FlyctlProvider -------------------------------
describe("FlyctlProvider", () => {
  it("isAvailable true when `fly` exists", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    await expect(new FlyctlProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable true when only `flyctl` exists", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "flyctl");
    await expect(new FlyctlProvider().isAvailable()).resolves.toBe(true);
  });

  it("isAvailable false when neither exists", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new FlyctlProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when no binary is on PATH", async () => {
    commandExistsMock.mockResolvedValue(false);
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when probe fails", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runMock.mockResolvedValueOnce(mkRun("unrelated"));
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runMock.mockResolvedValueOnce(mkRun("fly v0.2.45 windows/amd64"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runMock.mockResolvedValueOnce(mkRun("fly v0.2.45 windows/amd64"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.2.45");
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runMock.mockResolvedValueOnce(mkRun("fly v0.2.45 windows/amd64"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("0.3.0");
    const rows = await new FlyctlProvider().listOutdated();
    expect(rows).toEqual([
      { id: "flyctl", name: "Fly.io CLI", current: "0.2.45", latest: "0.3.0" },
    ]);
  });

  it("update returns skipped when no binary is found", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new FlyctlProvider().update("flyctl");
    expect(res).toMatchObject({
      id: "flyctl",
      success: false,
      skipped: true,
      message: expect.stringMatching(/introuvable/i),
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update runs `<bin> version upgrade`", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FlyctlProvider().update("flyctl");
    expect(res).toEqual({ id: "flyctl", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("fly", ["version", "upgrade"]);
  });

  it("update returns failure when runInherit fails", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "flyctl");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new FlyctlProvider().update("flyctl");
    expect(res).toEqual({ id: "flyctl", success: false });
    expect(runInheritMock).toHaveBeenCalledWith("flyctl", ["version", "upgrade"]);
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new FlyctlProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "fly");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new FlyctlProvider().updateAll([
      { id: "flyctl", name: "Fly.io CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "flyctl", success: true }]);
  });
});

// ----------------------------- GcloudProvider -------------------------------
describe("GcloudProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new GcloudProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new GcloudProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is empty/whitespace", async () => {
    runMock.mockResolvedValueOnce(mkRun("    "));
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when JSON parse fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips components that are not 'Update Available'", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          {
            id: "core",
            state: { name: "Installed" },
            current_version_string: "1.0.0",
            latest_version_string: "1.1.0",
          },
        ]),
      ),
    );
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips when current or latest missing or equal", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          {
            id: "missing-current",
            state: { name: "Update Available" },
            latest_version_string: "1.1.0",
          },
          {
            id: "missing-latest",
            state: { name: "Update Available" },
            current_version_string: "1.0.0",
          },
          {
            id: "equal",
            state: { name: "Update Available" },
            current_version_string: "1.0.0",
            latest_version_string: "1.0.0",
          },
        ]),
      ),
    );
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits rows for components with state=Update Available and differing versions", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          {
            id: "kubectl",
            name: "kubectl",
            state: { name: "Update Available" },
            current_version_string: "1.28.0",
            latest_version_string: "1.29.0",
          },
          {
            id: "bq",
            // name absent -> falls back to id
            state: { name: "update available" }, // case-insensitive match
            current_version_string: "2.0.95",
            latest_version_string: "2.0.99",
          },
        ]),
      ),
    );
    const rows = await new GcloudProvider().listOutdated();
    expect(rows).toEqual([
      { id: "kubectl", name: "kubectl", current: "1.28.0", latest: "1.29.0" },
      { id: "bq", name: "bq", current: "2.0.95", latest: "2.0.99" },
    ]);
  });

  it("listOutdated treats missing state.name as ''", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        JSON.stringify([
          {
            id: "x",
            current_version_string: "1.0.0",
            latest_version_string: "1.1.0",
          },
        ]),
      ),
    );
    await expect(new GcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs gcloud components update", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GcloudProvider().update("gcloud");
    expect(res).toEqual({ id: "gcloud", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("gcloud", [
      "components",
      "update",
      "--quiet",
    ]);
  });

  it("update returns failure when runInherit fails", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GcloudProvider().update("gcloud");
    expect(res).toEqual({ id: "gcloud", success: false });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new GcloudProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll maps outcomes per package once", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new GcloudProvider().updateAll([
      { id: "kubectl", name: "kubectl", current: "1", latest: "2" } as never,
      { id: "bq", name: "bq", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([
      { id: "kubectl", success: true },
      { id: "bq", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
  });

  it("updateAll propagates failure to every outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new GcloudProvider().updateAll([
      { id: "kubectl", name: "kubectl", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "kubectl", success: false }]);
  });
});

// ----------------------------- HcloudProvider -------------------------------
describe("HcloudProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new HcloudProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HcloudProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no version is parseable", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new HcloudProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("hcloud 1.45.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new HcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("hcloud 1.45.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.45.0");
    await expect(new HcloudProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("hcloud v1.45.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.46.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");
    const rows = await new HcloudProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "hcloud",
      name: "Hetzner Cloud CLI",
      current: "1.45.0",
      latest: "1.46.0",
      note: "via scoop",
    });
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("hcloud 1.45.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.46.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new HcloudProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with scoop package id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "hcloud", success: true });
    await new HcloudProvider().update("hcloud");
    expect(delegateUpdateMock.mock.calls[0]![0]).toMatchObject({
      id: "hcloud",
      binary: "hcloud",
      packageIds: { scoop: "hcloud" },
    });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new HcloudProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "hcloud", success: true });
    const res = await new HcloudProvider().updateAll([
      { id: "hcloud", name: "Hetzner Cloud CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "hcloud", success: true }]);
  });
});

// ----------------------------- HerokuProvider -------------------------------
describe("HerokuProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new HerokuProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HerokuProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HerokuProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("unrelated output"));
    await expect(new HerokuProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("heroku/8.7.1 win32-x64 node-v16"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new HerokuProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("heroku/8.7.1 win32-x64 node-v16"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("8.7.1");
    await expect(new HerokuProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row with note", async () => {
    runMock.mockResolvedValueOnce(mkRun("heroku/8.7.1 win32-x64 node-v16"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("8.8.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new HerokuProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "heroku",
      name: "Heroku CLI",
      current: "8.7.1",
      latest: "8.8.0",
      note: "manuel",
    });
    // Heroku notably does NOT flag `manual: true` even when source is manual
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("update routes through runPmUpdate when source is not manual", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    runPmUpdateMock.mockResolvedValueOnce({ id: "heroku", success: true });
    const res = await new HerokuProvider().update("heroku");
    expect(res).toEqual({ id: "heroku", success: true });
    expect(runPmUpdateMock).toHaveBeenCalledTimes(1);
    const args = runPmUpdateMock.mock.calls[0]!;
    expect(args[0]).toBe("heroku");
    expect(args[1]).toBe("scoop");
    expect(args[2]).toEqual({
      scoop: "heroku-cli",
      choco: "heroku-cli",
      winget: "Heroku.HerokuCLI",
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update runs `heroku update` when source is manual", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HerokuProvider().update("heroku");
    expect(res).toEqual({ id: "heroku", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("heroku", ["update"]);
    expect(runPmUpdateMock).not.toHaveBeenCalled();
  });

  it("update returns failure when manual `heroku update` fails", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new HerokuProvider().update("heroku");
    expect(res).toEqual({ id: "heroku", success: false });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new HerokuProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HerokuProvider().updateAll([
      { id: "heroku", name: "Heroku CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "heroku", success: true }]);
  });
});

// --------------------------- LinodeCliProvider ------------------------------
describe("LinodeCliProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new LinodeCliProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new LinodeCliProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nothing of value"));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("linode-cli 5.50.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("linode-cli 5.50.0"));
    fetchMock.mockRejectedValueOnce(new Error("dns"));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version field missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("linode-cli 5.50.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("linode-cli 5.50.0"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "5.50.0" } }));
    await expect(new LinodeCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("linode-cli 5.50.0\nCopyright"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "5.55.0" } }));
    const rows = await new LinodeCliProvider().listOutdated();
    expect(rows).toEqual([
      { id: "linode-cli", name: "Linode CLI", current: "5.50.0", latest: "5.55.0" },
    ]);
  });

  it("update returns skipped when no pip launcher is found", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new LinodeCliProvider().update("linode-cli");
    expect(res).toMatchObject({
      id: "linode-cli",
      success: false,
      skipped: true,
      message: expect.stringMatching(/pip\/python introuvable/i),
    });
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("update prefers python with `-m pip`", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new LinodeCliProvider().update("linode-cli");
    expect(res).toEqual({ id: "linode-cli", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("python", [
      "-m",
      "pip",
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "linode-cli",
    ]);
  });

  it("update falls back to py launcher", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "py");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new LinodeCliProvider().update("linode-cli");
    expect(runInheritMock).toHaveBeenCalledWith("py", expect.arrayContaining(["-m", "pip"]));
  });

  it("update falls back to bare pip", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pip");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new LinodeCliProvider().update("linode-cli");
    const args = runInheritMock.mock.calls[0]!;
    expect(args[0]).toBe("pip");
    expect(args[1]).not.toContain("-m");
  });

  it("update falls back to pip3", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "pip3");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new LinodeCliProvider().update("linode-cli");
    expect(runInheritMock.mock.calls[0]![0]).toBe("pip3");
  });

  it("update returns failure when runInherit fails", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new LinodeCliProvider().update("linode-cli");
    expect(res).toEqual({ id: "linode-cli", success: false });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new LinodeCliProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new LinodeCliProvider().updateAll([
      { id: "linode-cli", name: "Linode CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "linode-cli", success: true }]);
  });
});

// ----------------------------- OciCliProvider -------------------------------
describe("OciCliProvider", () => {
  it("isAvailable wires commandExists('oci')", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new OciCliProvider().isAvailable()).resolves.toBe(true);
    expect(commandExistsMock).toHaveBeenLastCalledWith("oci");
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new OciCliProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("xx not a version"));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("3.40.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("3.40.2"));
    fetchMock.mockRejectedValueOnce(new Error("oops"));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when info.version missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("3.40.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: {} }));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("3.40.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "3.40.2" } }));
    await expect(new OciCliProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.40.2"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ info: { version: "3.41.0" } }));
    const rows = await new OciCliProvider().listOutdated();
    expect(rows).toEqual([
      { id: "oci-cli", name: "Oracle Cloud CLI", current: "3.40.2", latest: "3.41.0" },
    ]);
  });

  it("update returns skipped when no pip launcher", async () => {
    commandExistsMock.mockResolvedValue(false);
    const res = await new OciCliProvider().update("oci-cli");
    expect(res).toMatchObject({
      id: "oci-cli",
      success: false,
      skipped: true,
      message: expect.stringMatching(/pip\/python introuvable/i),
    });
  });

  it("update with python -m pip succeeds", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OciCliProvider().update("oci-cli");
    expect(res).toEqual({ id: "oci-cli", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("python", [
      "-m",
      "pip",
      "install",
      "--user",
      "--upgrade",
      "--disable-pip-version-check",
      "oci-cli",
    ]);
  });

  it("update falls back through py/pip/pip3", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "py");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new OciCliProvider().update("oci-cli");
    expect(runInheritMock.mock.calls[0]![0]).toBe("py");

    commandExistsMock.mockReset();
    runInheritMock.mockReset();
    commandExistsMock.mockImplementation(async (b: string) => b === "pip");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new OciCliProvider().update("oci-cli");
    expect(runInheritMock.mock.calls[0]![0]).toBe("pip");

    commandExistsMock.mockReset();
    runInheritMock.mockReset();
    commandExistsMock.mockImplementation(async (b: string) => b === "pip3");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    await new OciCliProvider().update("oci-cli");
    expect(runInheritMock.mock.calls[0]![0]).toBe("pip3");
  });

  it("update returns failure when runInherit fails", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new OciCliProvider().update("oci-cli");
    expect(res).toEqual({ id: "oci-cli", success: false });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new OciCliProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    commandExistsMock.mockImplementation(async (b: string) => b === "python");
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new OciCliProvider().updateAll([
      { id: "oci-cli", name: "Oracle Cloud CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "oci-cli", success: true }]);
  });
});

// ---------------------------- RailwayProvider -------------------------------
describe("RailwayProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new RailwayProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new RailwayProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new RailwayProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no version", async () => {
    runMock.mockResolvedValueOnce(mkRun("not what we want"));
    await expect(new RailwayProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated parses 'railway X.Y.Z' form", async () => {
    runMock.mockResolvedValueOnce(mkRun("railway 3.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.6.0");
    detectInstallSourceMock.mockResolvedValueOnce("winget");
    describeSourceMock.mockReturnValueOnce("via winget");
    const rows = await new RailwayProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "3.5.0", latest: "3.6.0" });
  });

  it("listOutdated parses 'railwayapp X.Y.Z' form", async () => {
    runMock.mockResolvedValueOnce(mkRun("railwayapp 3.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.6.0");
    const rows = await new RailwayProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "3.5.0" });
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("railway 3.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new RailwayProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("railway 3.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.5.0");
    await expect(new RailwayProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("railway 3.5.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("3.6.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new RailwayProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with the right ids", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "railway", success: true });
    await new RailwayProvider().update("railway");
    expect(delegateUpdateMock.mock.calls[0]![0]).toMatchObject({
      id: "railway",
      binary: "railway",
      packageIds: { scoop: "railway", winget: "Railway.Railway" },
    });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new RailwayProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "railway", success: true });
    const res = await new RailwayProvider().updateAll([
      { id: "railway", name: "Railway CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "railway", success: true }]);
  });
});

// ------------------------------ ScwProvider --------------------------------
describe("ScwProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new ScwProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new ScwProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new ScwProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when neither pattern matches", async () => {
    runMock.mockResolvedValueOnce(mkRun("unrelated text"));
    await expect(new ScwProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated parses the 'Version v2.30.0' table form", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("Version          v2.30.0\nBuildDate         2024-01-01"),
    );
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.31.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");
    const rows = await new ScwProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "2.30.0", latest: "2.31.0" });
  });

  it("listOutdated falls back to 'scw version X.Y.Z'", async () => {
    runMock.mockResolvedValueOnce(mkRun("scw version 2.30.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.31.0");
    const rows = await new ScwProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "2.30.0" });
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version v2.30.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new ScwProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version v2.30.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.30.0");
    await expect(new ScwProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("Version v2.30.0"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.31.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new ScwProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with scoop id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "scw", success: true });
    await new ScwProvider().update("scw");
    expect(delegateUpdateMock.mock.calls[0]![0]).toMatchObject({
      id: "scw",
      binary: "scw",
      packageIds: { scoop: "scw" },
    });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new ScwProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "scw", success: true });
    const res = await new ScwProvider().updateAll([
      { id: "scw", name: "Scaleway CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "scw", success: true }]);
  });
});

// ---------------------------- SupabaseProvider ------------------------------
describe("SupabaseProvider", () => {
  it("isAvailable wires commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new SupabaseProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new SupabaseProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new SupabaseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when version cannot be parsed", async () => {
    runMock.mockResolvedValueOnce(mkRun("nope"));
    await expect(new SupabaseProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when latest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.180.4"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
    await expect(new SupabaseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.180.4"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.180.4");
    await expect(new SupabaseProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v1.180.4"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.181.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");
    const rows = await new SupabaseProvider().listOutdated();
    expect(rows[0]).toMatchObject({
      id: "supabase",
      name: "Supabase CLI",
      current: "1.180.4",
      latest: "1.181.0",
      note: "via scoop",
    });
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("1.180.4"));
    fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.181.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");
    const rows = await new SupabaseProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with scoop id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "supabase", success: true });
    await new SupabaseProvider().update("supabase");
    expect(delegateUpdateMock.mock.calls[0]![0]).toMatchObject({
      id: "supabase",
      binary: "supabase",
      packageIds: { scoop: "supabase" },
    });
  });

  it("updateAll short-circuits on empty", async () => {
    await expect(new SupabaseProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll forwards", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "supabase", success: false });
    const res = await new SupabaseProvider().updateAll([
      { id: "supabase", name: "Supabase CLI", current: "1", latest: "2" } as never,
    ]);
    expect(res).toEqual([{ id: "supabase", success: false }]);
  });
});
