import pLimit from "p-limit";

// --- OS-level / Windows -----------------------------------------------------
import { WingetProvider } from "../providers/os/winget.js";
import { ScoopProvider } from "../providers/os/scoop.js";
import { ChocoProvider } from "../providers/os/choco.js";

// --- WSL --------------------------------------------------------------------
import { WslProvider } from "../providers/wsl/wsl.js";
import { WslAptProvider } from "../providers/wsl/wsl-apt.js";
import { WslDnfProvider } from "../providers/wsl/wsl-dnf.js";
import { WslPacmanProvider } from "../providers/wsl/wsl-pacman.js";
import { WslBrewProvider } from "../providers/wsl/wsl-brew.js";
import { WslFlatpakProvider } from "../providers/wsl/wsl-flatpak.js";
import { WslNixProvider } from "../providers/wsl/wsl-nix.js";

// --- Node.js / JS -----------------------------------------------------------
import { NpmGlobalProvider } from "../providers/node/npm-global.js";
import { PnpmGlobalProvider } from "../providers/node/pnpm-global.js";
import { YarnGlobalProvider } from "../providers/node/yarn-global.js";
import { BunGlobalProvider } from "../providers/node/bun-global.js";
import { DenoProvider } from "../providers/node/deno.js";
import { CorepackProvider } from "../providers/node/corepack.js";
import { FnmProvider } from "../providers/node/fnm.js";
import { VoltaProvider } from "../providers/node/volta.js";
import { NvmWindowsProvider } from "../providers/node/nvm-windows.js";

// --- Python -----------------------------------------------------------------
import { PipProvider } from "../providers/python/pip.js";
import { PipxProvider } from "../providers/python/pipx.js";
import { UvToolsProvider } from "../providers/python/uv-tools.js";
import { PoetryProvider } from "../providers/python/poetry.js";
import { PdmProvider } from "../providers/python/pdm.js";
import { RyeProvider } from "../providers/python/rye.js";
import { PyenvWinProvider } from "../providers/python/pyenv-win.js";
import { CondaProvider } from "../providers/python/conda.js";

// --- .NET / PHP -------------------------------------------------------------
import { DotnetToolsProvider } from "../providers/dotnet-php/dotnet-tools.js";
import { ComposerSelfProvider } from "../providers/dotnet-php/composer-self.js";
import { ComposerGlobalProvider } from "../providers/dotnet-php/composer-global.js";
import { SymfonyCliProvider } from "../providers/dotnet-php/symfony-cli.js";
import { PhiveProvider } from "../providers/dotnet-php/phive.js";

// --- JVM (Java / Scala) -----------------------------------------------------
import { JBangProvider } from "../providers/jvm/jbang.js";
import { CoursierCsProvider } from "../providers/jvm/coursier-cs.js";

// --- Rust -------------------------------------------------------------------
import { RustupProvider } from "../providers/rust/rustup.js";
import { CargoProvider } from "../providers/rust/cargo.js";

// --- Other languages (Ruby / OCaml / Elixir / Lua / Haskell / Nim / Julia / R / Dart) ---
import { GemProvider } from "../providers/lang-other/gem.js";
import { OpamProvider } from "../providers/lang-other/opam.js";
import { HexProvider } from "../providers/lang-other/hex.js";
import { MixArchiveProvider } from "../providers/lang-other/mix-archive.js";
import { LuaRocksProvider } from "../providers/lang-other/luarocks.js";
import { CabalProvider } from "../providers/lang-other/cabal.js";
import { StackProvider } from "../providers/lang-other/stack.js";
import { NimbleProvider } from "../providers/lang-other/nimble.js";
import { JuliaPkgProvider } from "../providers/lang-other/julia-pkg.js";
import { RPackagesProvider } from "../providers/lang-other/r-packages.js";
import { FlutterProvider } from "../providers/lang-other/flutter.js";
import { PubGlobalProvider } from "../providers/lang-other/pub-global.js";

// --- Polyglot toolchain managers -------------------------------------------
import { MiseProvider } from "../providers/toolchain/mise.js";
import { AsdfProvider } from "../providers/toolchain/asdf.js";
import { ProtoProvider } from "../providers/toolchain/proto.js";
import { SdkmanProvider } from "../providers/toolchain/sdkman.js";
import { GoenvProvider } from "../providers/toolchain/goenv.js";

// --- Cloud CLIs -------------------------------------------------------------
import { AzProvider } from "../providers/cloud/az.js";
import { GcloudProvider } from "../providers/cloud/gcloud.js";
import { AwsCliV2Provider } from "../providers/cloud/aws-cli-v2.js";
import { OciCliProvider } from "../providers/cloud/oci-cli.js";
import { ScwProvider } from "../providers/cloud/scw.js";
import { HcloudProvider } from "../providers/cloud/hcloud.js";
import { LinodeCliProvider } from "../providers/cloud/linode-cli.js";
import { DoctlProvider } from "../providers/cloud/doctl.js";
import { SupabaseProvider } from "../providers/cloud/supabase.js";
import { HerokuProvider } from "../providers/cloud/heroku.js";
import { RailwayProvider } from "../providers/cloud/railway.js";
import { FlyctlProvider } from "../providers/cloud/flyctl.js";

// --- Infrastructure-as-Code -------------------------------------------------
import { TerraformProvider } from "../providers/iac/terraform.js";
import { OpenTofuProvider } from "../providers/iac/opentofu.js";
import { TerragruntProvider } from "../providers/iac/terragrunt.js";
import { VaultProvider } from "../providers/iac/vault.js";
import { ConsulProvider } from "../providers/iac/consul.js";
import { NomadProvider } from "../providers/iac/nomad.js";
import { PackerProvider } from "../providers/iac/packer.js";
import { BoundaryProvider } from "../providers/iac/boundary.js";
import { TFLintProvider } from "../providers/iac/tflint.js";
import { PulumiProvider } from "../providers/iac/pulumi.js";

// --- Kubernetes / Helm ------------------------------------------------------
import { HelmProvider } from "../providers/kubernetes/helm.js";
import { HelmRepoProvider } from "../providers/kubernetes/helm-repo.js";
import { HelmPluginsProvider } from "../providers/kubernetes/helm-plugins.js";
import { KubectlProvider } from "../providers/kubernetes/kubectl.js";
import { KrewProvider } from "../providers/kubernetes/krew.js";
import { KustomizeProvider } from "../providers/kubernetes/kustomize.js";
import { FluxProvider } from "../providers/kubernetes/flux.js";
import { ArgoCdProvider } from "../providers/kubernetes/argocd.js";
import { K3dProvider } from "../providers/kubernetes/k3d.js";
import { KindProvider } from "../providers/kubernetes/kind.js";
import { MinikubeProvider } from "../providers/kubernetes/minikube.js";
import { SkaffoldProvider } from "../providers/kubernetes/skaffold.js";
import { TiltProvider } from "../providers/kubernetes/tilt.js";

// --- Containers / OCI tooling ----------------------------------------------
import { NerdctlProvider } from "../providers/containers/nerdctl.js";
import { OrasProvider } from "../providers/containers/oras.js";
import { DiveProvider } from "../providers/containers/dive.js";
import { DockerImagesProvider } from "../providers/containers/docker-images.js";
import { DockerDesktopProvider } from "../providers/containers/docker-desktop.js";
import { PodmanDesktopProvider } from "../providers/containers/podman-desktop.js";
import { RancherDesktopProvider } from "../providers/containers/rancher-desktop.js";

// --- Security scanning ------------------------------------------------------
import { TrivyProvider } from "../providers/security/trivy.js";
import { GrypeProvider } from "../providers/security/grype.js";
import { SyftProvider } from "../providers/security/syft.js";
import { CosignProvider } from "../providers/security/cosign.js";
import { RekorProvider } from "../providers/security/rekor.js";
import { GitsignProvider } from "../providers/security/gitsign.js";
import { NucleiProvider } from "../providers/security/nuclei.js";
import { NucleiTemplatesProvider } from "../providers/security/nuclei-templates.js";
import { PdtmProvider } from "../providers/security/pdtm.js";
import { SemgrepProvider } from "../providers/security/semgrep.js";

// --- Dev CLIs (git-like, gh-extensions, ...) -------------------------------
import { LazygitProvider } from "../providers/dev-cli/lazygit.js";
import { LazydockerProvider } from "../providers/dev-cli/lazydocker.js";
import { JujutsuProvider } from "../providers/dev-cli/jj.js";
import { DeltaProvider } from "../providers/dev-cli/delta.js";
import { GlabProvider } from "../providers/dev-cli/glab.js";
import { TeaProvider } from "../providers/dev-cli/tea.js";
import { GhExtensionsProvider } from "../providers/dev-cli/gh-extensions.js";

// --- IDEs / Editor extensions ----------------------------------------------
import { VsCodeExtProvider } from "../providers/ide/vscode-ext.js";
import { CursorExtProvider } from "../providers/ide/cursor-ext.js";
import { WindsurfExtProvider } from "../providers/ide/windsurf-ext.js";
import { VsCodiumExtProvider } from "../providers/ide/vscodium-ext.js";
import { JetBrainsProvider } from "../providers/ide/jetbrains.js";
// Manual-only providers — every result they produce is `manual: true`, so
// scanAll filters them out and registering them would just add scan latency
// for no UI win. They live as code references in:
//   - src/providers/ide/jetbrains-plugins.ts
//   - src/providers/ide/zed-ext.ts
//   - src/providers/ide/sublime-pc.ts
//   - src/providers/ide/obsidian-plugins.ts
//   - src/providers/ide/unity-hub.ts
//   - src/providers/ide/notepad-pp.ts
//   - src/providers/ide/eclipse-marketplace.ts
// Re-register here if/when an automatable update path lands upstream.

// --- Editor plugin managers (headless-driven) ------------------------------
import { NvimLazyProvider } from "../providers/editor-plugins/nvim-lazy.js";
import { NvimPackerProvider } from "../providers/editor-plugins/nvim-packer.js";
import { NvimMasonProvider } from "../providers/editor-plugins/nvim-mason.js";
import { VimPlugProvider } from "../providers/editor-plugins/vim-plug.js";

// --- Embedded / Mobile ------------------------------------------------------
import { ArduinoCliProvider } from "../providers/embedded-mobile/arduino-cli.js";
import { PlatformIoProvider } from "../providers/embedded-mobile/platformio.js";
import { AndroidSdkProvider } from "../providers/embedded-mobile/android-sdk.js";
import { ExpoProvider } from "../providers/embedded-mobile/expo.js";
import { FastlaneProvider } from "../providers/embedded-mobile/fastlane.js";

// --- Shell / cosmetic + PowerShell modules ---------------------------------
import { OhMyPoshProvider } from "../providers/shell/oh-my-posh.js";
import { StarshipProvider } from "../providers/shell/starship.js";
import { NerdFontsProvider } from "../providers/shell/nerd-fonts.js";
import { PwshModulesProvider } from "../providers/shell/pwsh-modules.js";

// --- Meta -------------------------------------------------------------------
import { SelfProvider } from "../providers/self.js";

import type { Provider, ProviderScanResult } from "./types.js";

/**
 * Single source of truth for the provider list. Order here drives display
 * order in `gup doctor` and the scan table. Group conceptually related
 * providers together for readability.
 */
export const ALL_PROVIDERS: Provider[] = [
  // OS-level / Windows
  new WingetProvider(),
  new ScoopProvider(),
  new ChocoProvider(),
  new WslProvider(),
  new WslAptProvider(),
  new WslDnfProvider(),
  new WslPacmanProvider(),
  new WslBrewProvider(),
  new WslFlatpakProvider(),
  new WslNixProvider(),

  // Node.js / JS
  new NpmGlobalProvider(),
  new PnpmGlobalProvider(),
  new YarnGlobalProvider(),
  new BunGlobalProvider(),
  new DenoProvider(),
  new CorepackProvider(),

  // Node toolchain managers
  new FnmProvider(),
  new VoltaProvider(),
  new NvmWindowsProvider(),

  // Python
  new PipProvider(),
  new PipxProvider(),
  new UvToolsProvider(),
  new PoetryProvider(),
  new PdmProvider(),
  new RyeProvider(),
  new PyenvWinProvider(),
  new GoenvProvider(),
  new CondaProvider(),

  // Ruby
  new GemProvider(),

  // .NET / PHP
  new DotnetToolsProvider(),
  new ComposerSelfProvider(),
  new ComposerGlobalProvider(),
  new SymfonyCliProvider(),
  new PhiveProvider(),

  // JVM (Java / Scala)
  new JBangProvider(),
  new CoursierCsProvider(),

  // Other languages (OCaml / Elixir / Lua / Haskell / Nim / Julia / R)
  new OpamProvider(),
  new HexProvider(),
  new MixArchiveProvider(),
  new LuaRocksProvider(),
  new CabalProvider(),
  new StackProvider(),
  new NimbleProvider(),
  new JuliaPkgProvider(),
  new RPackagesProvider(),

  // Rust / PowerShell
  new RustupProvider(),
  new CargoProvider(),
  new PwshModulesProvider(),

  // Polyglot toolchain
  new MiseProvider(),
  new AsdfProvider(),
  new ProtoProvider(),
  new SdkmanProvider(),

  // Dart / Flutter
  new FlutterProvider(),
  new PubGlobalProvider(),

  // Cloud / IaC / K8s
  new AzProvider(),
  new GcloudProvider(),
  new TerraformProvider(),
  new OpenTofuProvider(),
  new TerragruntProvider(),
  new VaultProvider(),
  new ConsulProvider(),
  new NomadProvider(),
  new PackerProvider(),
  new BoundaryProvider(),
  new TFLintProvider(),
  new PulumiProvider(),
  new HelmProvider(),
  new HelmRepoProvider(),
  new HelmPluginsProvider(),
  new KubectlProvider(),
  new KrewProvider(),
  new KustomizeProvider(),
  new FluxProvider(),
  new ArgoCdProvider(),
  new K3dProvider(),
  new KindProvider(),
  new MinikubeProvider(),
  new SkaffoldProvider(),
  new TiltProvider(),

  // Containers / OCI tooling
  new NerdctlProvider(),
  new OrasProvider(),
  new DiveProvider(),
  new DockerImagesProvider(),
  new DockerDesktopProvider(),
  new PodmanDesktopProvider(),
  new RancherDesktopProvider(),

  // Containers / security scanning
  new TrivyProvider(),
  new GrypeProvider(),
  new SyftProvider(),
  new CosignProvider(),
  new RekorProvider(),
  new GitsignProvider(),
  new NucleiProvider(),
  new NucleiTemplatesProvider(),
  new PdtmProvider(),
  new SemgrepProvider(),

  // Dev CLIs (git-like, cloud)
  new LazygitProvider(),
  new LazydockerProvider(),
  new JujutsuProvider(),
  new DeltaProvider(),
  new DoctlProvider(),
  new GlabProvider(),
  new FlyctlProvider(),
  new TeaProvider(),
  new AwsCliV2Provider(),
  new OciCliProvider(),
  new ScwProvider(),
  new HcloudProvider(),
  new LinodeCliProvider(),
  new SupabaseProvider(),
  new HerokuProvider(),
  new RailwayProvider(),

  // Embedded / Mobile
  new ArduinoCliProvider(),
  new PlatformIoProvider(),
  new AndroidSdkProvider(),
  new ExpoProvider(),
  new FastlaneProvider(),

  // Shell / cosmetic
  new OhMyPoshProvider(),
  new StarshipProvider(),
  new NerdFontsProvider(),

  // Dev tools / IDEs
  new GhExtensionsProvider(),
  new VsCodeExtProvider(),
  new CursorExtProvider(),
  new WindsurfExtProvider(),
  new VsCodiumExtProvider(),
  new JetBrainsProvider(),

  // Editor plugin managers (headless-driven)
  new NvimLazyProvider(),
  new NvimPackerProvider(),
  new NvimMasonProvider(),
  new VimPlugProvider(),

  // Meta: self-update of package managers themselves (catalog § 10)
  new SelfProvider(),
];

export interface ScanOptions {
  /** Restrict to a subset of provider ids; empty = all available. */
  only?: string[];
  /** Skip providers self-flagged with `slow = true`. */
  fast?: boolean;
  /** Max parallel scans. Defaults to 4. */
  concurrency?: number;
  /** Fired when a provider's scan starts (for live progress UI). */
  onProviderStart?: (provider: Provider) => void;
  /** Fired when a provider's scan ends (success or failure). */
  onProviderEnd?: (provider: Provider, result: ProviderScanResult) => void;
  /**
   * Pre-detected provider list. When provided, skips the `isAvailable()` probe
   * pass — callers that already ran detection (e.g. UI that showed a spinner
   * for that phase) pass it here to avoid running detection twice.
   */
  detected?: Provider[];
}

export function getProvider(id: string): Provider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export async function detectAvailableProviders(): Promise<Provider[]> {
  const checks = await Promise.all(
    ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
  );
  return checks.filter((c) => c.ok).map((c) => c.p);
}

/**
 * Returns the filtered list of providers that will be scanned, without
 * actually running the scans. Useful for UI that needs to know the total
 * upfront (e.g. progress counters).
 */
export async function getProvidersToScan(
  options: ScanOptions = {},
): Promise<Provider[]> {
  const available = options.detected ?? (await detectAvailableProviders());
  return available.filter((p) => {
    if (options.only?.length && !options.only.includes(p.id)) return false;
    if (options.fast && p.slow) return false;
    return true;
  });
}

export async function scanAll(options: ScanOptions = {}): Promise<ProviderScanResult[]> {
  const filtered = await getProvidersToScan(options);

  const limit = pLimit(options.concurrency ?? 4);
  return Promise.all(
    filtered.map((p) =>
      limit(async (): Promise<ProviderScanResult> => {
        options.onProviderStart?.(p);
        let result: ProviderScanResult;
        try {
          const all = await p.listOutdated();
          // The tool only surfaces actionable updates — items the provider
          // flagged as `manual: true` (Toolbox-managed IDEs, manual binary
          // installs, plugins behind GUI managers, ...) are dropped here so
          // they never appear in lists, prompts, or "update all" flows.
          const packages = all.filter((pkg) => !pkg.manual);
          result = { providerId: p.id, available: true, packages };
        } catch (err) {
          result = {
            providerId: p.id,
            available: true,
            packages: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
        options.onProviderEnd?.(p, result);
        return result;
      }),
    ),
  );
}
