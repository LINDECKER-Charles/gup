/**
 * Centralized fetcher for HashiCorp's public releases API.
 * Used by Terraform, Vault, Consul, Nomad, Packer, Boundary, etc.
 */
interface HashicorpReleaseJson {
  version?: string;
}

export async function fetchHashicorpLatest(product: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.releases.hashicorp.com/v1/releases/${product}/latest`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as HashicorpReleaseJson;
    return data.version ?? null;
  } catch {
    return null;
  }
}
