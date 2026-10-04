import { HelmPluginsProvider } from "../../../src/providers/kubernetes/helm-plugins.js";
import { HelmRepoProvider } from "../../../src/providers/kubernetes/helm-repo.js";
import { KrewProvider } from "../../../src/providers/kubernetes/krew.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import type { CommandAnswer, HttpRoute, SystemSpec } from "../../support/system/types.js";

/**
 * What extends helm and kubectl: helm's plugins and chart repositories, which
 * can only be refreshed as a whole (one synthetic row each), and krew's
 * plugins, versioned one by one against the krew index. The machines a
 * knowledge test starts from are exported.
 */

const HELM_BINARY = "C:\\Users\\u\\scoop\\shims\\helm.exe";

export const HELM_PLUGIN_LIST = ["helm", "plugin", "list"];
export const HELM_REPO_LIST = ["helm", "repo", "list", "-o", "json"];

/** helm on PATH, answering `argv` with `answer`. */
export function helmMachine(argv: readonly string[], answer: CommandAnswer): SystemSpec {
  return { platform: "win32", bin: { helm: HELM_BINARY }, commands: [{ argv, ...answer }] };
}

const HELM_PLUGINS: ProviderContractCase = {
  create: () => new HelmPluginsProvider(),
  // A blank line between plugins is skipped, not counted.
  system: helmMachine(HELM_PLUGIN_LIST, {
    stdout:
      "NAME    VERSION   DESCRIPTION\n" +
      "diff    3.9.0     Preview helm upgrade changes as a diff\n" +
      "\n" +
      "secrets 4.5.0     This plugin provides secrets values encryption\n",
  }),
  outdated: [
    {
      id: "all",
      aggregate: true,
      name: "helm plugin update --all",
      current: "?",
      latest: "refresh",
      note: "2 plugin(s) installé(s)",
    },
  ],
  update: { packageId: "all", installs: [["helm", "plugin", "update", "--all"]] },
  updateAll: "collapsed",
};

const HELM_REPO: ProviderContractCase = {
  create: () => new HelmRepoProvider(),
  system: helmMachine(HELM_REPO_LIST, {
    stdout: JSON.stringify([
      { name: "bitnami", url: "https://charts.bitnami.com/bitnami" },
      { name: "ingress-nginx", url: "https://kubernetes.github.io/ingress-nginx" },
    ]),
  }),
  outdated: [
    {
      id: "all",
      aggregate: true,
      name: "helm repo update",
      current: "?",
      latest: "refresh",
      note: "2 repo(s) configurés",
    },
  ],
  update: { packageId: "all", installs: [["helm", "repo", "update"]] },
  updateAll: "collapsed",
};

// --- krew ---------------------------------------------------------------------------

const KREW_VERSION = ["kubectl", "krew", "version"];
const KREW_LIST = ["kubectl", "krew", "list"];

/** A plugin's manifest in the krew index, its `version:` as written there. */
export function krewManifest(name: string, body: string): HttpRoute {
  const url = `https://raw.githubusercontent.com/kubernetes-sigs/krew-index/master/plugins/${name}.yaml`;
  return { url, body };
}

interface KrewMachine {
  readonly list: CommandAnswer;
  readonly manifests?: readonly HttpRoute[];
  /** `kubectl krew version`; krew is installed by default. */
  readonly krew?: CommandAnswer;
}

const KREW_INSTALLED: CommandAnswer = { stdout: "OPTION            VALUE\nGitTag            v0.4.4" };

/** kubectl with krew, listing `list`, the index answering `manifests`. */
export function krewMachine(machine: KrewMachine): SystemSpec {
  return {
    platform: "linux",
    bin: { kubectl: "/usr/local/bin/kubectl" },
    commands: [
      { argv: KREW_VERSION, ...(machine.krew ?? KREW_INSTALLED) },
      { argv: KREW_LIST, ...machine.list },
    ],
    http: machine.manifests ?? [],
  };
}

const manifest = (version: string) =>
  `apiVersion: krew.googlecontainertools.github.com/v1alpha2\nkind: Plugin\nspec:\n  version: ${version}\n`;

/** Two plugins behind (one quoted in its manifest), one current: two rows, one request each. */
const KREW: ProviderContractCase = {
  create: () => new KrewProvider(),
  system: krewMachine({
    list: { stdout: "PLUGIN    VERSION\nctx       v0.9.4\nneat      v2.0.3\nns        v0.9.5\n" },
    manifests: [
      krewManifest("ctx", manifest("v0.9.5")),
      krewManifest("neat", manifest('"v2.1.0"')),
      krewManifest("ns", manifest("v0.9.5")),
    ],
  }),
  outdated: [
    { id: "ctx", name: "ctx", current: "v0.9.4", latest: "v0.9.5" },
    { id: "neat", name: "neat", current: "v2.0.3", latest: "v2.1.0" },
  ],
  update: { packageId: "ctx", installs: [["kubectl", "krew", "upgrade", "ctx"]] },
  // `kubectl krew upgrade` without a name upgrades every plugin at once.
  updateAll: "one-batch",
  batchInstalls: [["kubectl", "krew", "upgrade"]],
};

export const pluginsCases: readonly ProviderContractCase[] = [HELM_PLUGINS, HELM_REPO, KREW];
