import { getProvider } from "../../../src/core/registry.js";
import type { Provider } from "../../../src/core/types.js";

/**
 * A provider of the real registry, by id. Fixtures name providers by id and
 * take everything else (display name, platforms) from the registry, so a
 * screenshot shows what gup shows; an id the registry no longer has fails
 * the run instead of rendering a raw id.
 */
export function registeredProvider(id: string): Provider {
  const provider = getProvider(id);
  if (!provider) throw new Error(`screenshot fixtures name an unknown provider: ${id}`);
  return provider;
}
