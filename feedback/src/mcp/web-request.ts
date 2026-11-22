import type { FastifyRequest } from "fastify";

/**
 * Not handed to the SDK: credentials were checked already and stay in this
 * layer; framing headers describe a body that is passed parsed instead.
 */
const WITHHELD_HEADERS = new Set([
  "authorization", "cookie", "content-length", "transfer-encoding", "connection",
]);

/**
 * The web-standard `Request` the SDK's handlers take, built from Fastify's
 * request. It carries no body: the JSON body Fastify parsed (within the
 * route's limit) is passed alongside as `parsedBody`.
 */
export function toWebRequest(request: FastifyRequest, publicOrigin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || WITHHELD_HEADERS.has(name)) continue;
    for (const item of [value].flat()) headers.append(name, item);
  }
  return new Request(new URL(request.url, publicOrigin), { method: request.method, headers });
}
