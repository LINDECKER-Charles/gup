import {
  createMcpHandler, isLegacyRequest, WebStandardStreamableHTTPServerTransport,
  type AuthInfo, type McpHttpHandler, type McpServer,
} from "@modelcontextprotocol/server";
import { isMcpPermission } from "../domain/mcp-access.js";
import type { McpGrant } from "../ports/mcp-access-store.js";

/**
 * Open `subscriptions/listen` streams (modern clients). Nothing is ever
 * published on them — the tool list never changes — so a handful is plenty.
 */
const MAX_SUBSCRIPTIONS = 4;

/** No grant reaching the factory means no tool: never more than was granted. */
const NOTHING_GRANTED: McpGrant = { accessId: "", permissions: [] };

export interface McpEndpointOptions {
  /** A fresh server per request, with what its grant opens: nothing is kept between requests. */
  readonly createServer: (grant: McpGrant) => McpServer;
  readonly onError: (error: Error) => void;
}

/**
 * The grant, as the SDK carries it to the server factory. `token` is required
 * by the type and passed through untouched: it holds the access ID, never the
 * bearer token, which stays out of the SDK as the `Authorization` header does.
 */
function authInfoOf(grant: McpGrant): AuthInfo {
  return { token: grant.accessId, clientId: grant.accessId, scopes: [...grant.permissions] };
}

function grantOf(authInfo: AuthInfo | undefined): McpGrant {
  if (authInfo === undefined) return NOTHING_GRANTED;
  return { accessId: authInfo.clientId, permissions: authInfo.scopes.filter(isMcpPermission) };
}

/**
 * Streamable HTTP, stateless, for both protocol eras: the 2026-07-28
 * per-request envelope goes to the SDK's handler; 2025-era traffic
 * (`initialize` handshake, no envelope) to a per-request transport answering
 * plain JSON — the SDK's own legacy fallback would answer it over SSE.
 */
export class McpEndpoint {
  readonly #createServer: (grant: McpGrant) => McpServer;
  readonly #modern: McpHttpHandler;

  constructor(options: McpEndpointOptions) {
    this.#createServer = options.createServer;
    // `auto` answers a single JSON body: no tool emits anything before its
    // result. (`json` would say the same, plus a console warning.)
    this.#modern = createMcpHandler((context) => options.createServer(grantOf(context.authInfo)), {
      legacy: "reject", onerror: options.onError, maxSubscriptions: MAX_SUBSCRIPTIONS,
    });
  }

  async handle(request: Request, body: unknown, grant: McpGrant): Promise<Response> {
    if (await isLegacyRequest(request, body)) return this.#handleLegacy(request, body, grant);
    return this.#modern.fetch(request, { parsedBody: body, authInfo: authInfoOf(grant) });
  }

  close(): Promise<void> {
    return this.#modern.close();
  }

  async #handleLegacy(request: Request, body: unknown, grant: McpGrant): Promise<Response> {
    const server = this.#createServer(grant);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, { parsedBody: body });
    } finally {
      await server.close();
    }
  }
}
