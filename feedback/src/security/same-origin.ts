function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

interface OriginHeaders {
  readonly origin?: string | undefined;
  readonly referer?: string | undefined;
}

/**
 * Whether a state-changing request comes from the service's own pages: the
 * `Origin` header when the browser sent one, the `Referer`'s origin otherwise.
 * A request carrying neither is refused — every browser that runs the back
 * office sends at least one on a form POST.
 */
export function isSameOriginRequest(headers: OriginHeaders, expectedOrigin: string): boolean {
  if (headers.origin !== undefined) return headers.origin === expectedOrigin;
  if (headers.referer === undefined) return false;
  return originOf(headers.referer) === expectedOrigin;
}
