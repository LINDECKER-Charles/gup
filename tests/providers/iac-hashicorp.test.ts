import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { commandExistsMock, runMock, runInheritMock, isElevatedMock } =
  vi.hoisted(() => ({
    commandExistsMock: vi.fn(),
    runMock: vi.fn(),
    runInheritMock: vi.fn(),
    isElevatedMock: vi.fn(),
  }));

const { fetchHashicorpLatestMock } = vi.hoisted(() => ({
  fetchHashicorpLatestMock: vi.fn(),
}));

const { delegateUpdateMock, detectInstallSourceMock, describeSourceMock } =
  vi.hoisted(() => ({
    delegateUpdateMock: vi.fn(),
    detectInstallSourceMock: vi.fn(),
    describeSourceMock: vi.fn(),
  }));

vi.mock("../../src/core/runner.js", () => ({
  commandExists: commandExistsMock,
  run: runMock,
  runInherit: runInheritMock,
  isElevated: isElevatedMock,
}));

vi.mock("../../src/core/hashicorp-releases.js", () => ({
  fetchHashicorpLatest: fetchHashicorpLatestMock,
}));

vi.mock("../../src/core/install-source.js", () => ({
  delegateUpdate: delegateUpdateMock,
  detectInstallSource: detectInstallSourceMock,
  describeSource: describeSourceMock,
}));

import { TerraformProvider } from "../../src/providers/iac/terraform.js";
import { VaultProvider } from "../../src/providers/iac/vault.js";
import { ConsulProvider } from "../../src/providers/iac/consul.js";
import { NomadProvider } from "../../src/providers/iac/nomad.js";
import { PackerProvider } from "../../src/providers/iac/packer.js";
import { BoundaryProvider } from "../../src/providers/iac/boundary.js";

function mkRun(stdout: string, failed = false) {
  return { stdout, stderr: "", exitCode: failed ? 1 : 0, failed };
}

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  commandExistsMock.mockReset();
  runMock.mockReset();
  runInheritMock.mockReset();
  isElevatedMock.mockReset();
  fetchHashicorpLatestMock.mockReset();
  delegateUpdateMock.mockReset();
  detectInstallSourceMock.mockReset();
  describeSourceMock.mockReset();
  detectInstallSourceMock.mockResolvedValue("scoop");
  describeSourceMock.mockReturnValue("via scoop");
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface HcSpec {
  name: string;
  Ctor: new () => {
    isAvailable(): Promise<boolean>;
    listOutdated(): Promise<Array<{ id: string; current: string; latest: string }>>;
    update(id: string): Promise<{ id: string; success: boolean }>;
    updateAll(
      pkgs: Array<{ id: string; current: string; latest: string }>,
    ): Promise<Array<{ id: string; success: boolean }>>;
  };
  binary: string;
  product: string;
  versionStdout: (v: string) => string;
  unparsable: string;
  wingetId: string;
}

const hcSpecs: HcSpec[] = [
  {
    name: "vault",
    Ctor: VaultProvider,
    binary: "vault",
    product: "vault",
    versionStdout: (v) => `Vault v${v}\nRevision deadbeef`,
    unparsable: "garbage output without version",
    wingetId: "HashiCorp.Vault",
  },
  {
    name: "consul",
    Ctor: ConsulProvider,
    binary: "consul",
    product: "consul",
    versionStdout: (v) => `Consul v${v}\nRevision deadbeef`,
    unparsable: "no version here",
    wingetId: "HashiCorp.Consul",
  },
  {
    name: "nomad",
    Ctor: NomadProvider,
    binary: "nomad",
    product: "nomad",
    versionStdout: (v) => `Nomad v${v}\nBuildDate 2024-01-01`,
    unparsable: "unrecognized header",
    wingetId: "HashiCorp.Nomad",
  },
  {
    name: "packer",
    Ctor: PackerProvider,
    binary: "packer",
    product: "packer",
    versionStdout: (v) => `Packer v${v}`,
    unparsable: "no version line",
    wingetId: "HashiCorp.Packer",
  },
];

for (const spec of hcSpecs) {
  describe(`${spec.name} provider`, () => {
    it("isAvailable returns true when binary is found", async () => {
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
      expect(fetchHashicorpLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when current version cannot be parsed", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.unparsable));
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchHashicorpLatestMock).not.toHaveBeenCalled();
    });

    it("listOutdated returns [] when fetchHashicorpLatest returns null", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchHashicorpLatestMock.mockResolvedValueOnce(null);
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
      expect(fetchHashicorpLatestMock).toHaveBeenCalledWith(spec.product);
    });

    it("listOutdated returns [] when current equals latest (normalized)", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.2.3")));
      fetchHashicorpLatestMock.mockResolvedValueOnce("v1.2.3");
      await expect(new spec.Ctor().listOutdated()).resolves.toEqual([]);
    });

    it("listOutdated returns a single row when versions differ", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchHashicorpLatestMock.mockResolvedValueOnce("1.2.3");
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
      expect(detectInstallSourceMock).toHaveBeenCalledWith(spec.binary);
    });

    it("listOutdated flags manual installs", async () => {
      runMock.mockResolvedValueOnce(mkRun(spec.versionStdout("1.0.0")));
      fetchHashicorpLatestMock.mockResolvedValueOnce("v2.0.0");
      detectInstallSourceMock.mockResolvedValueOnce("manual");
      describeSourceMock.mockReturnValueOnce("manuel");

      const rows = await new spec.Ctor().listOutdated();
      expect(rows[0]).toMatchObject({ latest: "2.0.0", manual: true });
    });

    it("update delegates with the expected package ids", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().update(spec.name);
      expect(res).toEqual({ id: spec.name, success: true });
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
      const call = delegateUpdateMock.mock.calls[0]![0] as {
        id: string;
        binary: string;
        packageIds: { scoop?: string; choco?: string; winget?: string };
      };
      expect(call.id).toBe(spec.name);
      expect(call.binary).toBe(spec.binary);
      expect(call.packageIds.scoop).toBe(spec.name);
      expect(call.packageIds.choco).toBe(spec.name);
      expect(call.packageIds.winget).toBe(spec.wingetId);
    });

    it("updateAll returns [] when no packages", async () => {
      const res = await new spec.Ctor().updateAll([]);
      expect(res).toEqual([]);
      expect(delegateUpdateMock).not.toHaveBeenCalled();
    });

    it("updateAll delegates once per call when packages present", async () => {
      delegateUpdateMock.mockResolvedValueOnce({ id: spec.name, success: true });
      const res = await new spec.Ctor().updateAll([
        { id: spec.name, name: spec.name, current: "1.0.0", latest: "1.2.3" } as never,
      ]);
      expect(res).toEqual([{ id: spec.name, success: true }]);
      expect(delegateUpdateMock).toHaveBeenCalledTimes(1);
    });
  });
}

describe("boundary provider", () => {
  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new BoundaryProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new BoundaryProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when probe fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new BoundaryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when neither pattern matches", async () => {
    runMock.mockResolvedValueOnce(mkRun("totally unrelated text"));
    await expect(new BoundaryProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchHashicorpLatestMock).not.toHaveBeenCalled();
  });

  it("parses the 'Version Number:' style output", async () => {
    runMock.mockResolvedValueOnce(
      mkRun("Version information:\n  Version Number:  0.16.0"),
    );
    fetchHashicorpLatestMock.mockResolvedValueOnce("0.17.0");
    detectInstallSourceMock.mockResolvedValueOnce("scoop");
    describeSourceMock.mockReturnValueOnce("via scoop");

    const rows = await new BoundaryProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "boundary",
      current: "0.16.0",
      latest: "0.17.0",
    });
  });

  it("falls back to the 'Boundary vX.Y.Z' header when the structured line is absent", async () => {
    runMock.mockResolvedValueOnce(mkRun("Boundary v0.16.0"));
    fetchHashicorpLatestMock.mockResolvedValueOnce("v0.17.0");
    const rows = await new BoundaryProvider().listOutdated();
    expect(rows[0]).toMatchObject({ current: "0.16.0", latest: "0.17.0" });
  });

  it("returns [] when fetchHashicorpLatest is null", async () => {
    runMock.mockResolvedValueOnce(mkRun("Boundary v0.16.0"));
    fetchHashicorpLatestMock.mockResolvedValueOnce(null);
    await expect(new BoundaryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("returns [] when normalized current equals latest", async () => {
    runMock.mockResolvedValueOnce(mkRun("Boundary v0.16.0"));
    fetchHashicorpLatestMock.mockResolvedValueOnce("v0.16.0");
    await expect(new BoundaryProvider().listOutdated()).resolves.toEqual([]);
  });

  it("update delegates with HashiCorp.Boundary winget id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "boundary", success: true });
    await new BoundaryProvider().update("boundary");
    const call = delegateUpdateMock.mock.calls[0]![0] as {
      packageIds: { scoop?: string; choco?: string; winget?: string; brew?: string };
    };
    expect(call.packageIds).toEqual({
      scoop: "boundary",
      choco: "boundary",
      winget: "HashiCorp.Boundary",
      brew: "boundary",
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new BoundaryProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns a single outcome when packages are present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "boundary", success: false });
    const res = await new BoundaryProvider().updateAll([
      { id: "boundary", name: "Boundary", current: "0.16.0", latest: "0.17.0" } as never,
    ]);
    expect(res).toEqual([{ id: "boundary", success: false }]);
  });
});

describe("terraform provider", () => {
  function mkFetchResponse(body: unknown, ok = true) {
    return Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    } as unknown as Response);
  }

  it("isAvailable wires through commandExists", async () => {
    commandExistsMock.mockResolvedValueOnce(true);
    await expect(new TerraformProvider().isAvailable()).resolves.toBe(true);
    commandExistsMock.mockResolvedValueOnce(false);
    await expect(new TerraformProvider().isAvailable()).resolves.toBe(false);
  });

  it("listOutdated returns [] when terraform version -json fails", async () => {
    runMock.mockResolvedValueOnce(mkRun("", true));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when stdout is not valid JSON", async () => {
    runMock.mockResolvedValueOnce(mkRun("not json"));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when terraform_version is missing", async () => {
    runMock.mockResolvedValueOnce(mkRun(JSON.stringify({})));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listOutdated returns [] when releases API responds !ok", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.5.0" })),
    );
    fetchMock.mockReturnValueOnce(mkFetchResponse({}, false));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when latest version field is absent", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.5.0" })),
    );
    fetchMock.mockReturnValueOnce(mkFetchResponse({}));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when fetch throws", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.5.0" })),
    );
    fetchMock.mockImplementationOnce(() => {
      throw new Error("network");
    });
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns [] when current == latest", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.7.5" })),
    );
    fetchMock.mockReturnValueOnce(mkFetchResponse({ version: "1.7.5" }));
    await expect(new TerraformProvider().listOutdated()).resolves.toEqual([]);
  });

  it("listOutdated returns a row when versions differ", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.5.0" })),
    );
    fetchMock.mockReturnValueOnce(mkFetchResponse({ version: "1.7.5" }));
    detectInstallSourceMock.mockResolvedValueOnce("choco");
    describeSourceMock.mockReturnValueOnce("via choco");

    const rows = await new TerraformProvider().listOutdated();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "terraform",
      name: "Terraform",
      current: "1.5.0",
      latest: "1.7.5",
      note: "via choco",
    });
    expect(rows[0]).not.toHaveProperty("manual");
  });

  it("listOutdated flags manual installs", async () => {
    runMock.mockResolvedValueOnce(
      mkRun(JSON.stringify({ terraform_version: "1.5.0" })),
    );
    fetchMock.mockReturnValueOnce(mkFetchResponse({ version: "1.7.5" }));
    detectInstallSourceMock.mockResolvedValueOnce("manual");
    describeSourceMock.mockReturnValueOnce("manuel");

    const rows = await new TerraformProvider().listOutdated();
    expect(rows[0]).toMatchObject({ manual: true });
  });

  it("update delegates with HashiCorp.Terraform winget id", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "terraform", success: true });
    await new TerraformProvider().update("terraform");
    const call = delegateUpdateMock.mock.calls[0]![0] as {
      id: string;
      binary: string;
      packageIds: { scoop?: string; choco?: string; winget?: string; brew?: string };
    };
    expect(call.id).toBe("terraform");
    expect(call.binary).toBe("terraform");
    expect(call.packageIds).toEqual({
      scoop: "terraform",
      choco: "terraform",
      winget: "HashiCorp.Terraform",
      brew: "terraform",
    });
  });

  it("updateAll short-circuits on empty array", async () => {
    await expect(new TerraformProvider().updateAll([])).resolves.toEqual([]);
    expect(delegateUpdateMock).not.toHaveBeenCalled();
  });

  it("updateAll returns a single outcome when packages are present", async () => {
    delegateUpdateMock.mockResolvedValueOnce({ id: "terraform", success: true });
    const res = await new TerraformProvider().updateAll([
      { id: "terraform", name: "Terraform", current: "1.5.0", latest: "1.7.5" } as never,
    ]);
    expect(res).toEqual([{ id: "terraform", success: true }]);
  });
});
