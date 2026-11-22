/**
 * Posts the feedback as JSON and reduces every way it can end to an outcome
 * the form knows how to say: sent, invalid (with the service's field list),
 * limited, or unreachable. No credentials: the service is cross-origin and
 * answers CORS for the landing only.
 */
import { LINKS } from "../data/links.js";
import { FEEDBACK_PATH, REQUEST_TIMEOUT_MS } from "./rules.js";

const HTTP = Object.freeze({ created: 201, invalid: 400, limited: 429 });

export const FEEDBACK_ENDPOINT = `${LINKS.feedbackApi}${FEEDBACK_PATH}`;

async function invalidFields(response) {
  try {
    const body = await response.json();
    return Array.isArray(body?.fields) ? body.fields : [];
  } catch {
    return [];
  }
}

async function outcomeOf(response) {
  if (response.status === HTTP.created) return { outcome: "sent", fields: [] };
  if (response.status === HTTP.limited) return { outcome: "limited", fields: [] };
  if (response.status === HTTP.invalid) {
    return { outcome: "invalid", fields: await invalidFields(response) };
  }
  return { outcome: "unreachable", fields: [] };
}

/**
 * @param {Record<string, string | number>} payload
 * @returns {Promise<{ outcome: "sent" | "invalid" | "limited" | "unreachable", fields: string[] }>}
 */
export async function submitFeedback(payload) {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return await outcomeOf(response);
  } catch {
    // Offline, blocked or timed out: reported like any other failure.
    return { outcome: "unreachable", fields: [] };
  }
}
