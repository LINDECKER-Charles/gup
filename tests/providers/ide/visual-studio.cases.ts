import { type VsInstance, VisualStudioProvider } from "../../../src/providers/ide/visual-studio.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * Visual Studio (the IDE): `vswhere` lists the installed instances, the
 * Release channel manifest of each product line gives the latest version, and
 * the installer's documented `setup.exe update` verb upgrades an instance
 * (elevated). The builders a knowledge test starts from are exported.
 */

export const VS_INSTALLER_DIR = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer";
export const VSWHERE_EXE = `${VS_INSTALLER_DIR}\\vswhere.exe`;
export const VS_SETUP_EXE = `${VS_INSTALLER_DIR}\\setup.exe`;
export const VSWHERE_ARGV = [VSWHERE_EXE, "-all", "-products", "*", "-format", "json", "-utf8"];

export const COMMUNITY_PATH = "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community";
export const BUILDTOOLS_PATH =
  "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools";

/**
 * Field overrides for {@link vsInstance}. An explicit `undefined` stands for a
 * field vswhere omitted, which `exactOptionalPropertyTypes` would otherwise
 * reject on a plain `Partial<VsInstance>`.
 */
export type VsInstanceOverrides = { [K in keyof VsInstance]?: VsInstance[K] | undefined };

/** Shape of a real `vswhere -all -products * -format json -utf8` entry. */
export function vsInstance(overrides: VsInstanceOverrides = {}): VsInstance {
  return {
    instanceId: "a1f2b3c4",
    installDate: "2024-11-12T08:31:10Z",
    installationName: "VisualStudio/17.14.7+35931.197",
    installationPath: COMMUNITY_PATH,
    installationVersion: "17.14.35931.197",
    productId: "Microsoft.VisualStudio.Product.Community",
    displayName: "Visual Studio Community 2022",
    isPrerelease: false,
    catalog: {
      buildVersion: "17.14.35931.197",
      productDisplayVersion: "17.14.7",
      productLineVersion: "2022",
    },
    ...overrides,
  } as VsInstance;
}

/** `https://aka.ms/vs/17/release/channel` payload, trimmed to what the provider reads. */
export function channelManifest(
  display = "17.14.9",
  build = "17.14.36301.6",
): Record<string, unknown> {
  return {
    manifestVersion: "1.1",
    info: {
      id: "VisualStudio.17.Release",
      buildBranch: "d17.14",
      buildVersion: build,
      manifestName: "VisualStudio",
      manifestType: "channel",
      productDisplayVersion: display,
      productLine: "Dev17",
      productLineVersion: "2022",
    },
    channelItems: [
      { id: "Microsoft.VisualStudio.Product.Community", version: build, type: "Product" },
      { id: "Microsoft.VisualStudio.Manifests.Setup", version: "1.0.0" },
    ],
  };
}

export const VS_2022_CHANNEL = "https://aka.ms/vs/17/release/channel";
export const STABLE_CHANNEL = "https://aka.ms/vs/stable/channel";

/** A channel manifest answering at `url`. */
export function channelRoute(url: string, json: unknown = channelManifest()): HttpRoute {
  return { url, json };
}

export interface VsMachine {
  readonly instances: readonly VsInstance[];
  readonly http?: readonly HttpRoute[];
  /** The installer files present (default: vswhere.exe and setup.exe). */
  readonly files?: readonly string[];
  readonly elevated?: boolean;
}

/** Windows with the Visual Studio Installer, vswhere listing `instances`. */
export function vsMachine(machine: VsMachine): SystemSpec {
  const files = machine.files ?? [VSWHERE_EXE, VS_SETUP_EXE];
  return {
    platform: "win32",
    fs: Object.fromEntries(files.map((path) => [path, { kind: "file", executable: true }])),
    commands: [{ argv: VSWHERE_ARGV, stdout: JSON.stringify(machine.instances) }],
    http: machine.http ?? [channelRoute(VS_2022_CHANNEL)],
    elevated: machine.elevated ?? true,
  };
}

export function setupUpdateArgv(installationPath: string): string[] {
  return [VS_SETUP_EXE, "update", "--passive", "--norestart", "--installPath", installationPath];
}

/**
 * One Community instance behind the Release channel: an admin-gated row, the
 * documented update verb, one installer run per instance.
 */
const VISUAL_STUDIO: ProviderContractCase = {
  create: () => new VisualStudioProvider(),
  system: vsMachine({ instances: [vsInstance()] }),
  outdated: [
    {
      id: "a1f2b3c4",
      name: "Visual Studio Community 2022",
      current: "17.14.7",
      latest: "17.14.9",
      note: "via l'installeur Visual Studio",
      requiresAdmin: true,
    },
  ],
  update: { packageId: "a1f2b3c4", installs: [setupUpdateArgv(COMMUNITY_PATH)] },
  updateAll: "per-package",
};

export const visualStudioCases: readonly ProviderContractCase[] = [VISUAL_STUDIO];
