import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock, whichFirstMock } =
  vi.hoisted(() => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
    whichFirstMock: vi.fn(),
  }));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
  whichFirst: whichFirstMock,
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
}));

const {
  fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatchingMock,
  normalizeVersionMock,
} = vi.hoisted(() => ({
  fetchGitHubReleaseLatestMock: vi.fn(),
  fetchGitHubReleaseTagMatchingMock: vi.fn(),
  normalizeVersionMock: vi.fn((v: string) => v.trim().replace(/^v/i, "").toLowerCase()),
}));

vi.mock("../../src/core/gh-releases.js", () => ({
  fetchGitHubReleaseLatest: fetchGitHubReleaseLatestMock,
  fetchGitHubReleaseTagMatching: fetchGitHubReleaseTagMatchingMock,
  normalizeVersion: normalizeVersionMock,
}));

import { ArgoCdProvider } from "../../src/providers/kubernetes/argocd.js";
import { FluxProvider } from "../../src/providers/kubernetes/flux.js";
import { HelmPluginsProvider } from "../../src/providers/kubernetes/helm-plugins.js";
import { HelmRepoProvider } from "../../src/providers/kubernetes/helm-repo.js";
import { HelmProvider } from "../../src/providers/kubernetes/helm.js";
import { K3dProvider } from "../../src/providers/kubernetes/k3d.js";
import { KindProvider } from "../../src/providers/kubernetes/kind.js";
import { KrewProvider } from "../../src/providers/kubernetes/krew.js";
import { KubectlProvider } from "../../src/providers/kubernetes/kubectl.js";
import { KustomizeProvider } from "../../src/providers/kubernetes/kustomize.js";
import { MinikubeProvider } from "../../src/providers/kubernetes/minikube.js";
import { SkaffoldProvider } from "../../src/providers/kubernetes/skaffold.js";
import { TiltProvider } from "../../src/providers/kubernetes/tilt.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function textResponse(body: string, ok = true): Response {
  return { ok, text: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  whichFirstMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  runPmUpdateMock.mockReset();
  fetchGitHubReleaseLatestMock.mockReset();
  fetchGitHubReleaseTagMatchingMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -----------------------------------------------------------------------------
// Spec-driven coverage for the "fetchGitHubReleaseLatest + delegateUpdate"
// providers — they all share the same shape modulo binary name, version
// regex parsing and the package id mapping.
// -----------------------------------------------------------------------------

interface SimpleSpec {
  name: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<Array<{ id: string; current: string; latest: string; note?: string; manual?: boolean }>>;
    update(id: string): Promise<{ id: string; success: boolean }>;
    updateAll(pkgs: unknown[]): Promise<Array<{ id: string; success: boolean }>>;
  };
  binary: string;
  ghRepo: string;
  versionArgs: string[];
  versionStdout: (v: string) => string;
  unparsable: string;
  expectedPackageIds: { scoop?: string; choco?: string; winget?: string };
}

const simpleSpecs: SimpleSpec[] = [
  {
    name: "argocd",
    Ctor: ArgoCdProvider,
    binary: "argocd",
    ghRepo: "argoproj/argo-cd",
    versionArgs: ["version", "--client", "--short"],
    versionStdout: (v) => `argocd: v${v}+abcdef`,
    unparsable: "no version here",
    expectedPackageIds: { scoop: "argo-cd", choco: "argocd-cli", winget: "Argo.ArgoCD" },
  },
  {
    name: "flux",
    Ctor: FluxProvider,
    binary: "flux",
    ghRepo: "fluxcd/flux2",
    versionArgs: ["--version"],
    versionStdout: (v) => `flux version ${v}`,
    unparsable: "no number",
    expectedPackageIds: { scoop: "flux", choco: "flux", winget: "FluxCD.Flux" },
  },
  {
    name: "k3d",
    Ctor: K3dProvider,
    binary: "k3d",
    ghRepo: "k3d-io/k3d",
    versionArgs: ["version"],
    versionStdout: (v) => `k3d version v${v}\nk3s version v1.28.x`,
    unparsable: "garbage output without anything",
    expectedPackageIds: { scoop: "k3d", choco: "k3d", winget: "k3d-io.k3d" },
  },
  {
    name: "kind",
    Ctor: KindProvider,
    binary: "kind",
    ghRepo: "kubernetes-sigs/kind",
    versionArgs: ["version"],
    versionStdout: (v) => `kind v${v} go1.22.x linux/amd64`,
    unparsable: "wrong header",
    expectedPackageIds: { scoop: "kind", choco: "kind", winget: "Kubernetes.kind" },
  },
  {
    name: "minikube",
    Ctor: MinikubeProvider,
    binary: "minikube",
    ghRepo: "kubernetes/minikube",
    versionArgs: ["version"],
    versionStdout: (v) => `minikube version: v${v}\ncommit: deadbeef`,
    unparsable: "wrong header line",
    expectedPackageIds: { scoop: "minikube", choco: "minikube", winget: "Kubernetes.minikube" },
  },
  {
    name: "skaffold",
    Ctor: SkaffoldProvider,
    binary: "skaffold",
    ghRepo: "GoogleContainerTools/skaffold",
    versionArgs: ["version"],
    versionStdout: (v) => `v${v}`,
    unparsable: "abcdef",
    expectedPackageIds: { scoop: "skaffold", choco: "skaffold", winget: "Google.Skaffold" },
  },
  {
    name: "tilt",
    Ctor: TiltProvider,
    binary: "tilt",
    ghRepo: "tilt-dev/tilt",
    versionArgs: ["version"],
    versionStdout: (v) => `v${v}, built 2024-01-01`,
    unparsable: "no semver token",
    expectedPackageIds: { scoop: "tilt" },
  },
];

for (const spec of simpleSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable returns true when binary is on PATH", async () => {
      commandExistsMock.mockResolvedValueOnce(true);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(true);
      expect(commandExistsMock).toHaveBeenCalledWith(spec.binary);
    });

    it("isAvailable returns false when binary is missing", async () => {
      commandExistsMock.mockResolvedValueOnce(false);
      await expect(new spec.Ctor().isAvailable()).resolves.toBe(false);
    });

    it("listOutdated returns [] when version probe fails", async () => {
      runMock.mockResolvedValueOnce(mkRun("", true));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when the version regex finds nothing", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when fetchGitHubReleaseLatest is null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchGitHubReleaseLatestMock).toHaveBeenCalledWith(spec.ghRepo);
    });

    it("listOutdated returns [] when current === latest", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.2.3")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns a row when versions differ (PM source)", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("1.2.3");
      detectInstallSourceMock.mockResolvedValueOnce("winget");
      describeSourceMock.mockReturnValueOnce("via winget");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: spec.name,
        current: "1.0.0",
        latest: "1.2.3",
        note: "via winget",
      });
      expect(rows[0]).not.toHaveProperty("manual");
      expect(detectInstallSourceMock).toHaveBeenCalledWith(spec.binary);
    });

    it("listOutdated flags manual installs", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchGitHubReleaseLatestMock.mockResolvedValueOnce("2.0.0");
      detectInstallSourceMock.mockResolvedValueOnce("manual");
      describeSourceMock.mockReturnValueOnce("manuel");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows[0]).toMatchObject({ manual: true });
    });

    it("update delegates with the expected package ids", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().update(spec.name);
      expect(res).toEqual({ id: spec.name, success: true });
      const arg = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: Record<string, string>;
        manualMessage: string;
      };
      expect(arg.id).toBe(spec.name);
      expect(arg.binary).toBe(spec.binary);
      expect(arg.packageIds).toEqual(spec.expectedPackageIds);
      expect(arg.manualMessage).toMatch(/[Tt]l|charger|github\.com/i);
    });

    it("updateAll returns [] for an empty package list", async () => {
      await expect(new spec.Ctor().updateAll([])).resolves.toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll delegates exactly once when packages are present", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: false });
      const res = await new spec.Ctor().updateAll([
        { id: spec.name, current: "1.0.0", latest: "1.2.3" },
      ]);
      expect(res).toEqual([{ id: spec.name, success: false }]);
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
}

// -----------------------------------------------------------------------------
// helm — uses raw fetch() to api.github.com (not the shared helper).
// -----------------------------------------------------------------------------

describe("helm provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new HelmProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HelmProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when version probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when stdout has no semver token", async () => {
    runMock.mockResolvedValueOnce(mkRun("garbage"));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetch is !ok", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.15.4+g123"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when tag_name is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.15.4+g123"));
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.15.4+g123"));
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current equals latest after v-strip", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.15.4+g123"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.15.4" }));
    await expect(new HelmProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when current != latest, with PM note", async () => {
    runMock.mockResolvedValueOnce(mkRun("v3.15.4+g123"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.16.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("choco");
    describeSourceMock.mockReturnValueOnce("via choco");

    const rows = await new HelmProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "helm",
      name: "Helm",
      current: "3.15.4",
      latest: "3.16.0",
      note: "via choco",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("3.15.4"));
    fetchMock.mockResolvedValueOnce(jsonResponse({ tag_name: "v3.16.0" }));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new HelmProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with kubernetes-helm choco id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "helm", success: true });
    await new HelmProvider().update("helm");
    const arg = delegateUpdateMock.mock.calls[0]![0] as {
      packageIds: Record<string, string>;
    };
    expect(arg.packageIds).toEqual({
      scoop: "helm",
      choco: "kubernetes-helm",
      winget: "Helm.Helm",
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new HelmProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll delegates once when packages present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "helm", success: true });
    const res = await new HelmProvider().updateAll([
      { id: "helm", current: "3.15.4", latest: "3.16.0" },
    ]);
    expect(res).toEqual([{ id: "helm", success: true }]);
  });
});

// -----------------------------------------------------------------------------
// kubectl — uses raw fetch() to dl.k8s.io (text response).
// -----------------------------------------------------------------------------

describe("kubectl provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new KubectlProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new KubectlProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when stdout is not JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when clientVersion.gitVersion is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({})));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch !ok", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ clientVersion: { gitVersion: "v1.29.0" } })),
    );
    fetchMock.mockResolvedValueOnce(textResponse("", false));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ clientVersion: { gitVersion: "v1.29.0" } })),
    );
    fetchMock.mockRejectedValueOnce(new Error("net"));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when normalized current equals latest", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ clientVersion: { gitVersion: "v1.30.0" } })),
    );
    fetchMock.mockResolvedValueOnce(textResponse("v1.30.0\n"));
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ clientVersion: { gitVersion: "v1.29.0" } })),
    );
    fetchMock.mockResolvedValueOnce(textResponse("v1.30.0\n"));
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new KubectlProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "kubectl",
      current: "1.29.0",
      latest: "1.30.0",
      note: "via scoop",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ clientVersion: { gitVersion: "v1.29.0" } })),
    );
    fetchMock.mockResolvedValueOnce(textResponse("v1.30.0"));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new KubectlProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with kubernetes-cli choco id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "kubectl", success: true });
    await new KubectlProvider().update("kubectl");
    const arg = delegateUpdateMock.mock.calls[0]![0] as {
      packageIds: Record<string, string>;
    };
    expect(arg.packageIds).toEqual({
      scoop: "kubectl",
      choco: "kubernetes-cli",
      winget: "Kubernetes.kubectl",
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new KubectlProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll delegates once when packages present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "kubectl", success: true });
    const res = await new KubectlProvider().updateAll([
      { id: "kubectl", current: "1.29.0", latest: "1.30.0" },
    ]);
    expect(res).toEqual([{ id: "kubectl", success: true }]);
  });
});

// -----------------------------------------------------------------------------
// kustomize — uses fetchGitHubReleaseTagMatching with prefix stripping.
// -----------------------------------------------------------------------------

describe("kustomize provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new KustomizeProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new KustomizeProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new KustomizeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when no semver is found", async () => {
    runMock.mockResolvedValueOnce(mkRun("not a version"));
    await expect(new KustomizeProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchGitHubReleaseTagMatchingMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when fetchGitHubReleaseTagMatching returns null", async () => {
    runMock.mockResolvedValueOnce(mkRun("v5.4.3"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce(null);
    await expect(new KustomizeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated strips the 'kustomize/' prefix and compares equal", async () => {
    runMock.mockResolvedValueOnce(mkRun("v5.4.3"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("kustomize/v5.4.3");
    await expect(new KustomizeProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated emits a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(mkRun("v5.4.3"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("kustomize/v5.5.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new KustomizeProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "kustomize",
      current: "5.4.3",
      latest: "5.5.0",
      note: "via scoop",
    });
    expect(rows[0]).not.toHaveProperty("manual");

    // The provider passes a predicate; verify it was supplied and matches.
    const args = fetchGitHubReleaseTagMatchingMock.mock.calls[0]!;
    expect(args[0]).toBe("kubernetes-sigs/kustomize");
    expect((args[1] as (t: string) => boolean)("kustomize/v5.5.0")).toBe(true);
    expect((args[1] as (t: string) => boolean)("api/v0.0.1")).toBe(false);
    expect(args[2]).toEqual({ stripVPrefix: false });
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(mkRun("v5.4.3"));
    fetchGitHubReleaseTagMatchingMock.mockResolvedValueOnce("kustomize/v5.5.0");
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new KustomizeProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with Kubernetes.kustomize winget id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "kustomize", success: true });
    await new KustomizeProvider().update("kustomize");
    const arg = delegateUpdateMock.mock.calls[0]![0] as {
      packageIds: Record<string, string>;
    };
    expect(arg.packageIds).toEqual({
      scoop: "kustomize",
      choco: "kustomize",
      winget: "Kubernetes.kustomize",
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new KustomizeProvider().updateAll([])).resolves.toEqual([]);
  });

  it("updateAll delegates once when packages present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "kustomize", success: true });
    const res = await new KustomizeProvider().updateAll([
      { id: "kustomize", current: "5.4.3", latest: "5.5.0" },
    ]);
    expect(res).toEqual([{ id: "kustomize", success: true }]);
  });
});

// -----------------------------------------------------------------------------
// helm-plugins — synthetic "all plugins" entry.
// -----------------------------------------------------------------------------

describe("helm-plugins provider", () => {
  it("isAvailable returns false when helm is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HelmPluginsProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when `helm plugin list` fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HelmPluginsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when no plugins are installed", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("NAME\tVERSION\tDESCRIPTION\n"));
    await expect(new HelmPluginsProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when at least one plugin is parsed", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(
      mkRun(
        "NAME    VERSION   DESCRIPTION\n" +
          "diff    3.9.0     Preview helm upgrade changes\n",
      ),
    );
    await expect(new HelmPluginsProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when the probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HelmPluginsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when the header is missing (no NAME/VERSION line)", async () => {
    runMock.mockResolvedValueOnce(mkRun("totally unrelated"));
    await expect(new HelmPluginsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when header exists but no plugin rows", async () => {
    runMock.mockResolvedValueOnce(mkRun("NAME    VERSION   DESCRIPTION\n\n"));
    await expect(new HelmPluginsProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns synthetic row when plugins are installed (skips blank lines)", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "NAME    VERSION   DESCRIPTION\n" +
          "diff    3.9.0     Preview helm upgrade changes\n" +
          "\n" +
          "secrets 4.5.0     Helm secrets plugin\n",
      ),
    );
    const rows = await new HelmPluginsProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "all",
      name: "helm plugin update --all",
      current: "?",
      latest: "refresh",
    });
    expect(rows[0]!.note).toMatch(/2 plugin/);
  });

  it("update runs `helm plugin update --all` and returns success on exit 0", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HelmPluginsProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("helm", [
      "plugin",
      "update",
      "--all",
    ]);
  });

  it("update returns success: false on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new HelmPluginsProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new HelmPluginsProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll triggers a single update when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HelmPluginsProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
  });
});

// -----------------------------------------------------------------------------
// helm-repo — `helm repo list -o json`.
// -----------------------------------------------------------------------------

describe("helm-repo provider", () => {
  it("isAvailable returns false when helm is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when `helm repo list` fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when JSON parse fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("not-json"));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when parsed JSON is empty", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("[]"));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns false when parsed JSON is not an array", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun('{"name":"x"}'));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when at least one repo is configured", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify([{ name: "stable", url: "https://x" }])));
    await expect(new HelmRepoProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when the probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new HelmRepoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when JSON parse throws", async () => {
    runMock.mockResolvedValueOnce(mkRun("bad json"));
    await expect(new HelmRepoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when the repo list is empty", async () => {
    runMock.mockResolvedValueOnce(mkRun("[]"));
    await expect(new HelmRepoProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns one synthetic refresh row when repos are configured", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify([
        { name: "stable", url: "https://x" },
        { name: "bitnami", url: "https://y" },
      ])),
    );
    const rows = await new HelmRepoProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "all",
      name: "helm repo update",
      current: "?",
      latest: "refresh",
    });
    expect(rows[0]!.note).toMatch(/2 repo/);
  });

  it("update runs `helm repo update` and returns success on exit 0", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HelmRepoProvider().update("all");
    expect(res).toEqual({ id: "all", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("helm", ["repo", "update"]);
  });

  it("update returns success: false on non-zero exit", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new HelmRepoProvider().update("all");
    expect(res).toEqual({ id: "all", success: false });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new HelmRepoProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll triggers one update when packages present", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new HelmRepoProvider().updateAll([
      { id: "all", current: "?", latest: "refresh" },
    ]);
    expect(res).toEqual([{ id: "all", success: true }]);
  });
});

// -----------------------------------------------------------------------------
// krew — multi-plugin scan with per-plugin manifest fetch.
// -----------------------------------------------------------------------------

describe("krew provider", () => {
  it("isAvailable returns false when kubectl is missing", async () => {
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new KrewProvider().isAvailable()).resolves.toBe(false);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("isAvailable returns false when `kubectl krew version` fails", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new KrewProvider().isAvailable()).resolves.toBe(false);
  });

  it("isAvailable returns true when krew probe succeeds", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    runMock.mockResolvedValueOnce(mkRun("krew v0.4.4"));
    await expect(new KrewProvider().isAvailable()).resolves.toBe(true);
  });

  it("listOutdated returns [] when `kubectl krew list` fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when no plugins parsed (no header)", async () => {
    runMock.mockResolvedValueOnce(mkRun("unrelated text"));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when header is found but no rows present", async () => {
    runMock.mockResolvedValueOnce(mkRun("PLUGIN    VERSION\n\n"));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated skips rows missing a second column", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("PLUGIN    VERSION\nonlyname\n"),
    );
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated yields rows for plugins whose latest != current", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(
        "PLUGIN    VERSION\n" +
          "neat      v2.0.3\n" +
          "ns        v0.9.4\n",
      ),
    );
    // neat: latest 2.1.0 (different) -> row
    // ns: latest equals current -> filtered
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/neat.yaml"))
        return textResponse('version: "v2.1.0"\nfoo: bar\n');
      if (url.includes("/ns.yaml"))
        return textResponse('version: v0.9.4\n');
      return textResponse("", false);
    });

    const rows = await new KrewProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "neat",
      name: "neat",
      current: "v2.0.3",
      latest: 'v2.1.0',
    });
  });

  it("listOutdated drops plugins when manifest fetch is !ok", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("PLUGIN  VERSION\nfoo  v1.0.0\n"),
    );
    fetchMock.mockResolvedValueOnce(textResponse("", false));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops plugins when manifest fetch throws", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("PLUGIN  VERSION\nfoo  v1.0.0\n"),
    );
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated drops plugins whose manifest lacks a version: line", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("PLUGIN  VERSION\nfoo  v1.0.0\n"),
    );
    fetchMock.mockResolvedValueOnce(textResponse("description: nothing here\n"));
    await expect(new KrewProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update runs `kubectl krew upgrade <id>` and returns success", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new KrewProvider().update("neat");
    expect(res).toEqual({ id: "neat", success: true });
    expect(runInheritMock).toHaveBeenCalledWith("kubectl", ["krew", "upgrade", "neat"]);
  });

  it("update returns failure when upgrade exits non-zero", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new KrewProvider().update("neat");
    expect(res).toEqual({ id: "neat", success: false });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new KrewProvider().updateAll([])).resolves.toEqual([]);
    expect(runInheritMock).not.toHaveBeenCalled();
  });

  it("updateAll runs a single `kubectl krew upgrade` and maps outcomes", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun(""));
    const res = await new KrewProvider().updateAll([
      { id: "neat", current: "v2.0.3", latest: "v2.1.0" },
      { id: "ns", current: "v0.9.4", latest: "v1.0.0" },
    ]);
    expect(res).toEqual([
      { id: "neat", success: true },
      { id: "ns", success: true },
    ]);
    expect(runInheritMock).toHaveBeenCalledTimes(1);
    expect(runInheritMock).toHaveBeenCalledWith("kubectl", ["krew", "upgrade"]);
  });

  it("updateAll propagates failure to every package outcome", async () => {
    runInheritMock.mockResolvedValueOnce(mkRun("", true));
    const res = await new KrewProvider().updateAll([
      { id: "neat", current: "v2.0.3", latest: "v2.1.0" },
    ]);
    expect(res).toEqual([{ id: "neat", success: false }]);
  });
});
