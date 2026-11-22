import {
  createMcpHandler, isLegacyRequest, WebStandardStreamableHTTPServerTransport,
  type McpHttpHandler, type McpServer,
} from "@modelcontextprotocol/server";

/**
 * Open `subscriptions/listen` streams (modern clients). Nothing is ever
 * published on them — the tool list never changes — so a handful is plenty.
 */
const MAX_SUBSCRIPTIONS = 4;

export interface McpEndpointOptions {
  /** A fresh server for one request: nothing is kept between requests. */
  readonly createServer: () => McpServer;
  readonly onError: (error: Error) => void;
}

/**
 * Streamable HTTP, stateless, for both protocol eras: the 2026-07-28
 * per-request envelope goes to the SDK's handler; 2025-era traffic
 * (`initialize` handshake, no envelope) to a per-request transport answering
 * plain JSON — the SDK's own legacy fallback would answer it over SSE.
 */
export class McpEndpoint {
  readonly #createServer: () => McpServer;
  readonly #modern: McpHttpHandler;

  constructor(options: McpEndpointOptions) {
    this.#createServer = options.createServer;
    // `auto` answers a single JSON body: no tool emits anything before its
    // result. (`json` would say the same, plus a console warning.)
    this.#modern = createMcpHandler(options.createServer, {
      legacy: "reject", onerror: options.onError, maxSubscriptions: MAX_SUBSCRIPTIONS,
    });
  }

  async handle(request: Request, body: unknown): Promise<Response> {
    if (await isLegacyRequest(request, body)) return this.#handleLegacy(request, body);
    return this.#modern.fetch(request, { parsedBody: body });
  }

  close(): Promise<void> {
    return this.#modern.close();
  }

  async #handleLegacy(request: Request, body: unknown): Promise<Response> {
    const server = this.#createServer();
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
