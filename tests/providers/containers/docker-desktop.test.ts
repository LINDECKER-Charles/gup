import { describe, expect, it } from "vitest";
import { DockerDesktopProvider } from "../../../src/providers/containers/docker-desktop.js";
import { system } from "../../support/system/fake-system.js";
import { DESKTOP_EXES, DOCKER_VERSION_ARGV, dockerMachine, dockerRelease } from "./containers.cases.js";

/** Docker Desktop's release feed (docker/for-win), read directly rather than through gh-releases. */

const VERSION = "4.34.2.167585";
const listed = () => new DockerDesktopProvider().listOutdated();

describe("DockerDesktopProvider.listOutdated", () => {
  it("hands the exe path to PowerShell through the environment, never in the script", async () => {
    await system.load(dockerMachine(VERSION, dockerRelease({ tag_name: "v4.35.0" })));
    await listed();
    const [probe] = system.trace.spawns;
    expect(probe?.argv).toEqual(DOCKER_VERSION_ARGV);
    expect(probe?.env?.["GUP_DOCKER_DESKTOP_EXE"]).toBe(DESKTOP_EXES.docker);
    expect(probe?.argv.join(" ")).not.toContain("Docker Desktop.exe");
  });

  it("reads the release name when the release has no tag", async () => {
    await system.load(dockerMachine(VERSION, dockerRelease({ name: "4.36.0" })));
    await expect(listed()).resolves.toMatchObject([{ current: "4.34.2", latest: "4.36.0" }]);
  });

  it.each([
    ["neither a tag nor a name", {}],
    ["a tag without a version", { tag_name: "no-numbers-here" }],
  ])("lists nothing for a release with %s", async (_label, json) => {
    await system.load(dockerMachine(VERSION, dockerRelease(json)));
    await expect(listed()).resolves.toEqual([]);
  });
});
