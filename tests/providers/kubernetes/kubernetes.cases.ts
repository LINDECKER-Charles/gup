import { ArgoCdProvider } from "../../../src/providers/kubernetes/argocd.js";
import { FluxProvider } from "../../../src/providers/kubernetes/flux.js";
import { HelmProvider } from "../../../src/providers/kubernetes/helm.js";
import { K3dProvider } from "../../../src/providers/kubernetes/k3d.js";
import { KindProvider } from "../../../src/providers/kubernetes/kind.js";
import { KubectlProvider } from "../../../src/providers/kubernetes/kubectl.js";
import { KustomizeProvider } from "../../../src/providers/kubernetes/kustomize.js";
import { MinikubeProvider } from "../../../src/providers/kubernetes/minikube.js";
import { SkaffoldProvider } from "../../../src/providers/kubernetes/skaffold.js";
import { TiltProvider } from "../../../src/providers/kubernetes/tilt.js";
import {
  nothingListedCase,
  type ReleasedTool,
  releasedToolCases,
} from "../../support/contract/released-tool.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { githubLatest } from "../../support/system/releases.js";
import type { HttpRoute } from "../../support/system/types.js";

/**
 * Kubernetes CLIs: single binaries whose latest version comes from their
 * releases (GitHub, kubectl's own stable.txt), upgraded by the installer
 * that owns them. The routes and probes a knowledge test starts from are
 * exported.
 */

/** A released binary whose GitHub tags carry a `v`, banner and ids aside. */
interface GithubTool {
  readonly create: ReleasedTool["create"];
  readonly id: string;
  readonly name: string;
  readonly binary?: string;
  readonly repo: string;
  readonly probe: ReleasedTool["probe"];
  readonly current: string;
  readonly latest: string;
  readonly delegation: ReleasedTool["delegation"];
}

function githubTool(tool: GithubTool): ReleasedTool {
  return {
    ...tool,
    binary: tool.binary ?? tool.id,
    release: githubLatest(tool.repo, `v${tool.latest}`),
    upToDate: githubLatest(tool.repo, `v${tool.current}`),
  };
}

const download = (repo: string, exe: string) =>
  `Télécharger https://github.com/${repo}/releases et remplacer ${exe}.exe`;

const ARGOCD = githubTool({
  create: () => new ArgoCdProvider(),
  id: "argocd",
  name: "ArgoCD CLI",
  repo: "argoproj/argo-cd",
  probe: { argv: ["argocd", "version", "--client", "--short"], stdout: "argocd: v2.11.3+3f344d5" },
  current: "2.11.3",
  latest: "2.13.1",
  delegation: {
    ids: { scoop: "argo-cd", choco: "argocd-cli", winget: "Argo.ArgoCD", brew: "argocd" },
    manualMessage: download("argoproj/argo-cd", "argocd"),
  },
});

const FLUX = githubTool({
  create: () => new FluxProvider(),
  id: "flux",
  name: "Flux CLI",
  repo: "fluxcd/flux2",
  probe: { argv: ["flux", "--version"], stdout: "flux version 2.3.0" },
  current: "2.3.0",
  latest: "2.4.0",
  delegation: {
    // flux lives in the fluxcd tap: the tap-qualified name is what `brew upgrade` resolves.
    ids: { scoop: "flux", choco: "flux", winget: "FluxCD.Flux", brew: "fluxcd/tap/flux" },
    manualMessage: download("fluxcd/flux2", "flux"),
  },
});

const K3D = githubTool({
  create: () => new K3dProvider(),
  id: "k3d",
  name: "k3d",
  repo: "k3d-io/k3d",
  probe: { argv: ["k3d", "version"], stdout: "k3d version v5.6.3\nk3s version v1.28.8-k3s1 (default)" },
  current: "5.6.3",
  latest: "5.7.4",
  delegation: {
    ids: { scoop: "k3d", choco: "k3d", winget: "k3d-io.k3d", brew: "k3d" },
    manualMessage: download("k3d-io/k3d", "k3d"),
  },
});

const KIND = githubTool({
  create: () => new KindProvider(),
  id: "kind",
  name: "kind",
  repo: "kubernetes-sigs/kind",
  probe: { argv: ["kind", "version"], stdout: "kind v0.23.0 go1.21.10 windows/amd64" },
  current: "0.23.0",
  latest: "0.25.0",
  delegation: {
    ids: { scoop: "kind", choco: "kind", winget: "Kubernetes.kind", brew: "kind" },
    manualMessage: download("kubernetes-sigs/kind", "kind"),
  },
});

const MINIKUBE = githubTool({
  create: () => new MinikubeProvider(),
  id: "minikube",
  name: "Minikube",
  repo: "kubernetes/minikube",
  probe: {
    argv: ["minikube", "version"],
    stdout: "minikube version: v1.33.1\ncommit: 5883c09216182566a63dff4c326a6fc9ed2982ff",
  },
  current: "1.33.1",
  latest: "1.34.0",
  delegation: {
    ids: { scoop: "minikube", choco: "minikube", winget: "Kubernetes.minikube", brew: "minikube" },
    manualMessage: download("kubernetes/minikube", "minikube"),
  },
});

const SKAFFOLD = githubTool({
  create: () => new SkaffoldProvider(),
  id: "skaffold",
  name: "Skaffold",
  repo: "GoogleContainerTools/skaffold",
  probe: { argv: ["skaffold", "version"], stdout: "v2.12.0" },
  current: "2.12.0",
  latest: "2.13.2",
  delegation: {
    ids: { scoop: "skaffold", choco: "skaffold", winget: "Google.Skaffold", brew: "skaffold" },
    manualMessage: download("GoogleContainerTools/skaffold", "skaffold"),
  },
});

const TILT = githubTool({
  create: () => new TiltProvider(),
  id: "tilt",
  name: "Tilt",
  repo: "tilt-dev/tilt",
  probe: { argv: ["tilt", "version"], stdout: "v0.33.17, built 2024-06-12" },
  current: "0.33.17",
  latest: "0.33.21",
  delegation: {
    ids: { scoop: "tilt", brew: "tilt" },
    manualMessage: download("tilt-dev/tilt", "tilt"),
  },
});

// --- helm: its own release lookup ---------------------------------------------------

const HELM = githubTool({
  create: () => new HelmProvider(),
  id: "helm",
  name: "Helm",
  repo: "helm/helm",
  // The short version carries the commit after a `+`.
  probe: { argv: ["helm", "version", "--short"], stdout: "v3.15.4+gfa9efb0" },
  current: "3.15.4",
  latest: "3.16.3",
  delegation: {
    // Chocolatey's helm package is `kubernetes-helm`.
    ids: { scoop: "helm", choco: "kubernetes-helm", winget: "Helm.Helm", brew: "helm" },
    manualMessage: "Télécharger https://github.com/helm/helm/releases/latest et remplacer helm.exe",
  },
});

const HELM_WITHOUT_TAG = nothingListedCase(HELM, "release without a tag", {
  release: { ...HELM.release, json: {} },
});

// --- kubectl: dl.k8s.io's stable.txt -------------------------------------------------

export const KUBECTL_VERSION_ARGV = ["kubectl", "version", "--client", "-o", "json"];

/** `https://dl.k8s.io/release/stable.txt`: one line, the tag. */
export function kubectlStable(tag: string): HttpRoute {
  return { url: "https://dl.k8s.io/release/stable.txt", body: `${tag}\n` };
}

/** `kubectl version --client -o json` for `gitVersion`. */
function kubectlClientJson(gitVersion: string): string {
  return JSON.stringify(
    { clientVersion: { major: "1", minor: "29", gitVersion, platform: "windows/amd64" } },
    null,
    2,
  );
}

const KUBECTL: ReleasedTool = {
  create: () => new KubectlProvider(),
  id: "kubectl",
  name: "kubectl",
  binary: "kubectl",
  probe: { argv: KUBECTL_VERSION_ARGV, stdout: kubectlClientJson("v1.29.0") },
  current: "1.29.0",
  release: kubectlStable("v1.30.0"),
  latest: "1.30.0",
  upToDate: kubectlStable("v1.29.0"),
  delegation: {
    ids: {
      scoop: "kubectl",
      choco: "kubernetes-cli",
      winget: "Kubernetes.kubectl",
      brew: "kubernetes-cli",
    },
    manualMessage: "Télécharger kubectl depuis https://kubernetes.io/releases/download/",
  },
};

// --- kustomize: its tags share the repository with other modules --------------------

const KUSTOMIZE_RELEASES_URL =
  "https://api.github.com/repos/kubernetes-sigs/kustomize/releases?per_page=30";

/** The release list, newest first: the kustomize module's tag after another module's. */
export function kustomizeReleases(...tags: string[]): HttpRoute {
  return { url: KUSTOMIZE_RELEASES_URL, json: tags.map((tag) => ({ tag_name: tag })) };
}

const KUSTOMIZE: ReleasedTool = {
  create: () => new KustomizeProvider(),
  id: "kustomize",
  name: "Kustomize",
  binary: "kustomize",
  probe: { argv: ["kustomize", "version"], stdout: "v5.4.3" },
  current: "5.4.3",
  release: kustomizeReleases("api/v0.18.0", "kyaml/v0.18.1", "kustomize/v5.5.0"),
  latest: "5.5.0",
  upToDate: kustomizeReleases("api/v0.17.3", "kustomize/v5.4.3"),
  delegation: {
    ids: { scoop: "kustomize", choco: "kustomize", winget: "Kubernetes.kustomize", brew: "kustomize" },
    manualMessage: download("kubernetes-sigs/kustomize", "kustomize"),
  },
};

export const kubernetesCases: readonly ProviderContractCase[] = [
  ...[ARGOCD, FLUX, K3D, KIND, MINIKUBE, SKAFFOLD, TILT, HELM, KUBECTL, KUSTOMIZE].flatMap(
    releasedToolCases,
  ),
  HELM_WITHOUT_TAG,
];
