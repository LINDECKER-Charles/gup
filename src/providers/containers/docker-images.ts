import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Refresh locally pulled Docker images via `docker pull <repo:tag>`. Docker
 * exposes no native "outdated" probe (comparing local manifest digests to
 * registry digests would require an authenticated manifest API call per
 * image), so every named image is surfaced as a refresh candidate. Untagged
 * images (`<none>:<none>`) and dangling layers are excluded â€” they cannot be
 * pulled by reference.
 */
export class DockerImagesProvider implements Provider {
  readonly id = "docker-images";
  readonly displayName = "Docker images";
  readonly installHint = "winget install Docker.DockerDesktop";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("docker"))) return false;
    // Daemon reachable? `docker info` is the canonical probe; cheap enough.
    const probe = await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
    return !probe.failed;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const images = await listLocalImages();
    return images.map((img) => ({
      id: img.ref,
      name: img.ref,
      current: img.shortId,
      latest: "pull",
      note: img.size,
    }));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("docker", ["pull", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

interface LocalImage {
  ref: string;
  shortId: string;
  size: string;
}

async function listLocalImages(): Promise<LocalImage[]> {
  const { stdout, failed } = await run("docker", [
    "image",
    "ls",
    "--format",
    "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}",
  ]);
  if (failed) return [];

  const seen = new Map<string, LocalImage>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [repo, tag, id, size] = trimmed.split("\t");
    if (!repo || !tag || repo === "<none>" || tag === "<none>") continue;
    const ref = `${repo}:${tag}`;
    if (seen.has(ref)) continue;
    seen.set(ref, {
      ref,
      shortId: id?.slice(0, 12) ?? "?",
      size: size ?? "",
    });
  }
  return Array.from(seen.values());
}
