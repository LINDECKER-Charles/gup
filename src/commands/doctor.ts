import { ALL_PROVIDERS } from "../core/registry.js";
import { renderProvidersStatus } from "../ui/table.js";

export async function doctorCommand(): Promise<number> {
  const checks = await Promise.all(
    ALL_PROVIDERS.map(async (p) => ({ p, ok: await p.isAvailable() })),
  );

  const detected = checks.filter((c) => c.ok).map((c) => c.p.id);
  const missing = checks
    .filter((c) => !c.ok)
    .map((c) => ({
      id: c.p.id,
      displayName: c.p.displayName,
      ...(c.p.installHint && { installHint: c.p.installHint }),
    }));

  process.stdout.write(`${renderProvidersStatus(detected, missing)}\n`);
  return 0;
}
