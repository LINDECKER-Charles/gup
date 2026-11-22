export type FormOutcome = "sent" | "invalid" | "limited";

export interface FormRedirectInput {
  /** The posted `returnTo`, untrusted. */
  readonly returnTo: unknown;
  readonly outcome: FormOutcome;
  readonly allowedOrigins: readonly string[];
  readonly landingUrl: string;
}

const FRAGMENT = "feedback";

function trustedReturnUrl(input: FormRedirectInput): URL {
  if (typeof input.returnTo === "string") {
    try {
      const url = new URL(input.returnTo);
      if (input.allowedOrigins.includes(url.origin)) return url;
    } catch {
      // Not a URL: fall back to the landing.
    }
  }
  return new URL(input.landingUrl);
}

/**
 * Where a no-JavaScript form post sends the browser back: `returnTo` when its
 * origin is allowed (never an open redirect), the landing otherwise, with
 * `feedback=<outcome>` and the `#feedback` fragment.
 */
export function formRedirectUrl(input: FormRedirectInput): string {
  const url = trustedReturnUrl(input);
  url.searchParams.set("feedback", input.outcome);
  url.hash = FRAGMENT;
  return url.href;
}
