import { describe, expect, it } from "vitest";
import { KubectlProvider } from "../../../src/providers/kubernetes/kubectl.js";
import { installedVia } from "../../support/contract/installers.js";
import { system } from "../../support/system/fake-system.js";
import { KUBECTL_VERSION_ARGV, kubectlStable } from "./kubernetes.cases.js";

describe("KubectlProvider.listOutdated", () => {
  it("lists nothing, and asks dl.k8s.io nothing, when the client JSON names no version", async () => {
    const probe = { argv: KUBECTL_VERSION_ARGV, stdout: JSON.stringify({}) };
    await system.load(
      installedVia("scoop", "kubectl", { commands: [probe], http: [kubectlStable("v1.30.0")] }),
    );
    await expect(new KubectlProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
