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
    const all = await listLocalImages();
    const pullable = await filterPullableImages(all);
    return pullable.map((img) => ({
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

/**
 * Drop locally-built images from the candidate list. `docker image inspect`
 * exposes `.RepoDigests` — non-empty when the image was pulled from a registry
 * (each entry is "<repo>@sha256:..."), null/empty when the image was built
 * locally (`docker build -t myapp .`). Surfacing the latter as "outdated" is
 * a guaranteed FAIL on update because `docker pull myapp:latest` has no
 * upstream to talk to. The probe is free (no network, inspects local
 * metadata) and the contract is strict: exactly one JSON line per input ref,
 * same order. Internal — referenced only by listOutdated().
 *
 * Fallback to the unfiltered list whenever the probe's output drifts from
 * that contract (`failed` with empty stdout, line count mismatch, etc.)
 * rather than silently dropping images on a malformed payload. Better a
 * few known false positives than hidden pullable images.
 */
async function filterPullableImages(images: LocalImage[]): Promise<LocalImage[]> {
  if (images.length === 0) return images;
  const { stdout, failed } = await run("docker", [
    "image",
    "inspect",
    "--format",
    "{{json .RepoDigests}}",
    ...images.map((img) => img.ref),
  ]);
  if (failed && !stdout.trim()) return images;

  const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
  // Strict-contract guard: any deviation from "one line per ref" means we
  // cannot map outputs back to inputs by index without risk of shifting and
  // dropping a real pullable image. Surface the unfiltered list instead.
  if (lines.length !== images.length) return images;

  const out: LocalImage[] = [];
  for (let i = 0; i < images.length; i++) {
    if (hasRepoDigest(lines[i])) out.push(images[i]!);
  }
  return out;
}

function hasRepoDigest(line: string | undefined): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed || trimmed === "null" || trimmed === "[]") return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
