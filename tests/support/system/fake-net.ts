import { UnscriptedRequestError } from "./errors.js";
import { machine, type ResolvedRoute } from "./machine.js";
import type { HttpFaultMode, RequestRecord } from "./types.js";

/**
 * `fetch` of the fake machine: exact-URL routes answered with real `Response`
 * objects, so `res.ok`, `res.json()`, `res.text()` and `res.headers` behave
 * natively. An aborted signal rejects with its reason, as the real `fetch`.
 */

const HTTP_NOT_FOUND = 404;

/** GitHub's unauthenticated rate-limit answer. */
const RATE_LIMITED: ResolvedRoute = {
  method: "GET",
  url: "",
  status: 403,
  body: JSON.stringify({
    message: "API rate limit exceeded for 203.0.113.7.",
    documentation_url:
      "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting",
  }),
  headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" },
};

function respond(route: ResolvedRoute, url: string): Response {
  const response = new Response(route.body, { status: route.status, headers: route.headers });
  // A constructed Response has an empty url; the real one carries the request's.
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function plain(status: number, body: string): ResolvedRoute {
  return { method: "GET", url: "", status, body, headers: {} };
}

function faultResponse(mode: HttpFaultMode, url: string): Response {
  switch (mode) {
    case "status-500":
      return respond(plain(500, "Internal Server Error"), url);
    case "rate-limited":
      return respond(RATE_LIMITED, url);
    case "bad-json":
      return respond(plain(200, "{not json"), url);
    case "network":
      throw new TypeError("fetch failed");
    case "abort":
      throw new DOMException("This operation was aborted", "AbortError");
  }
}

function httpFault(url: string): HttpFaultMode | undefined {
  for (const fault of machine().faults) {
    if (fault.on === "http" && fault.url === url) return fault.mode;
  }
  return undefined;
}

type FetchInput = string | URL | Request;

function requestOf(input: FetchInput, init?: RequestInit): RequestRecord {
  const url = input instanceof Request ? input.url : String(input);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return { method: method.toUpperCase(), url };
}

function unscripted(method: string, url: string): never {
  const state = machine();
  if (state.isExploring) throw new TypeError("fetch failed");
  const known = state.routes.map((route) => `${route.method} ${route.url}`);
  const error = new UnscriptedRequestError(method, url, known);
  state.unscripted.push(error);
  throw error;
}

export async function fakeFetch(input: FetchInput, init?: RequestInit): Promise<Response> {
  const { method, url } = requestOf(input, init);
  const state = machine();
  state.requests.push({ method, url });
  init?.signal?.throwIfAborted();
  const fault = httpFault(url);
  if (fault) return faultResponse(fault, url);
  const route = state.routes.find((known) => known.method === method && known.url === url);
  if (route) return respond(route, url);
  if (state.isPermissive) return respond(plain(HTTP_NOT_FOUND, ""), url);
  return unscripted(method, url);
}
