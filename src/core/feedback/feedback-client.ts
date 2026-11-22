import type { InstallIdentity } from "./install-identity.js";
import { signatureHeader } from "./request-signature.js";

/**
 * One signed request to the feedback service: the install's signature
 * (`request-signature.ts`), a hard timeout, and every failure — a refusal, a
 * timeout, a socket error — folded into an outcome. It never throws and
 * never reads the response body: what the service answers beyond its status
 * is not needed. The body sent is the very text that was signed.
 */

export type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;

export interface ServiceRequest {
  readonly method: "POST" | "DELETE";
  readonly url: string;
  readonly identity: Pick<InstallIdentity, "publicKey" | "privateKey">;
  /** JSON text; absent for a request without a body. */
  readonly body?: string;
  readonly timeoutMs: number;
  /** Epoch milliseconds the request is signed at. */
  readonly signedAt: number;
}

export type ServiceOutcome =
  | { readonly ok: true; readonly status: number }
  /** `status` is absent when no response came back (timeout, network). */
  | { readonly ok: false; readonly status?: number; readonly reason: string };

const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;

export async function callFeedbackService(
  request: ServiceRequest,
  fetchImpl: FetchLike = fetch,
): Promise<ServiceOutcome> {
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: headersOf(request),
      ...(request.body !== undefined && { body: request.body }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const { status } = response;
    if (status >= SUCCESS_MIN && status <= SUCCESS_MAX) return { ok: true, status };
    return { ok: false, status, reason: `HTTP ${status}` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : String(error) };
  }
}

function headersOf(request: ServiceRequest): Record<string, string> {
  const authorization = signatureHeader({ ...request, body: request.body ?? "" });
  return {
    authorization,
    ...(request.body !== undefined && { "content-type": "application/json" }),
  };
}
