import { webPageUrl } from "../export/web-page-url.js";
import type { Locale } from "../i18n/locale.js";
import type { ClientInfo } from "./client-info.js";

/**
 * Where feedback goes (`docs/development/feedback-service.md` § Origins): the
 * service that receives shared journals, and the form on the landing site.
 * Both are constants, overridable for local development with
 * `GUP_FEEDBACK_API` and `GUP_FEEDBACK_FORM`. An override must be `https:`,
 * or `http:` on a loopback host (the local service, the Vite dev server).
 * One that is set but refused — clear text to another machine, credentials,
 * not a URL — disables what it addresses (uploads and erasure, or the form)
 * and is listed by {@link FeedbackUrls.rejected}: it never falls back to
 * production, so a mistyped staging address does not send there.
 */

/** What the form is prefilled with, besides the language of its page. */
export interface FormContext {
  readonly installId: string;
  readonly client: Pick<ClientInfo, "gupVersion" | "platform" | "locale">;
}

const SERVICE_ENV = "GUP_FEEDBACK_API";
const FORM_ENV = "GUP_FEEDBACK_FORM";
const DEFAULT_SERVICE_ORIGIN = "https://gup.charles-lindecker.com";
const DEFAULT_FORM_URL = "https://lindecker-charles.github.io/gup/";
/** The landing's French pages live under `fr/`; English is at its root. */
const LOCALE_PATHS: Readonly<Record<Locale, string>> = { en: "", fr: "fr/" };
const FORM_FRAGMENT = "#feedback";

export class FeedbackUrls {
  readonly #service: URL | null;
  readonly #form: URL | null;
  readonly #rejected: readonly string[];

  constructor(env: NodeJS.ProcessEnv) {
    this.#service = resolved(env[SERVICE_ENV], DEFAULT_SERVICE_ORIGIN);
    this.#form = resolved(env[FORM_ENV], DEFAULT_FORM_URL);
    this.#rejected = [
      ...(this.#service === null ? [SERVICE_ENV] : []),
      ...(this.#form === null ? [FORM_ENV] : []),
    ];
  }

  /** The variables set to an address gup refuses: what they address is off for the run. */
  rejected(): readonly string[] {
    return this.#rejected;
  }

  /** `DELETE` here to erase everything the install shared; null when the override is refused. */
  installUrl(installId: string): string | null {
    if (this.#service === null) return null;
    return `${this.#service.origin}/api/installs/${encodeURIComponent(installId)}`;
  }

  /** `POST` the journal batches here; null when the override is refused. */
  installLogsUrl(installId: string): string | null {
    const install = this.installUrl(installId);
    return install === null ? null : `${install}/logs`;
  }

  /**
   * The feedback form, in the user's language, prefilled with the install id,
   * gup's version and the platform: `…/gup/fr/?install=…&version=…&platform=…#feedback`;
   * null when the override is refused.
   */
  formUrl({ installId, client }: FormContext): string | null {
    if (this.#form === null) return null;
    const url = new URL(this.#form);
    const base = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    url.pathname = `${base}${LOCALE_PATHS[client.locale]}`;
    url.search = new URLSearchParams({
      install: installId,
      version: client.gupVersion,
      platform: client.platform,
    }).toString();
    url.hash = FORM_FRAGMENT;
    return url.toString();
  }
}

/** The override when acceptable, the default when unset or empty, null when refused. */
function resolved(override: string | undefined, fallback: string): URL | null {
  if (override === undefined || override.trim() === "") return new URL(fallback);
  return webPageUrl(override);
}
