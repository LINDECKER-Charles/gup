import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../../app-deps.js";
import { FIELD_RULES } from "../../domain/field-rules.js";
import type { LogBatch } from "../../domain/journal.js";
import { validateLogBatch } from "../../domain/validate-log-batch.js";
import { InstallSignatureVerifier } from "../../identity/install-signature-verifier.js";
import { DURATION_MS } from "../../time-units.js";
import { HttpError } from "../http-error.js";
import { HTTP_STATUS } from "../http-status.js";
import { RateLimitGate } from "../rate-limit-gate.js";
import { sendApiError } from "./api-error.js";

const LOGS_PATH = "/api/installs/:installId/logs";
const INSTALL_PATH = "/api/installs/:installId";
const LIMITS = {
  /** Across both routes, per client address (IPv6 grouped by /64, the plugin's default). */
  requestsPerAddress: 120,
  /** Per install: keyed on the ID only once the signature proved it. */
  uploadsPerInstall: 60,
  newInstallsPerAddress: 10,
} as const;
const EMPTY_BODY = Buffer.alloc(0);
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

/** Same answer for a missing, malformed or wrong signature: nothing to tell them apart. */
const UNAUTHORIZED = {
  status: HTTP_STATUS.unauthorized,
  error: "unauthorized",
  message: "Missing or invalid install signature.",
} as const;

function installIdOf(request: FastifyRequest): string {
  return (request.params as { installId?: string }).installId ?? "";
}

function rawBodyOf(request: FastifyRequest): Buffer {
  return Buffer.isBuffer(request.body) ? request.body : EMPTY_BODY;
}

/** The signature covers the exact bytes, so the body is parsed here and not by Fastify. */
function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(STRICT_UTF8.decode(body));
  } catch {
    throw new HttpError(HTTP_STATUS.badRequest, "The body is not UTF-8 JSON.");
  }
}

function invalidBatch(reply: FastifyReply, fields: readonly string[]): FastifyReply {
  return sendApiError(reply, {
    status: HTTP_STATUS.badRequest,
    error: "invalid",
    message: "The batch does not match the upload contract.",
    details: { fields },
  });
}

interface InstallGates {
  readonly perAddress: RateLimitGate;
  readonly perInstall: RateLimitGate;
  readonly newInstalls: RateLimitGate;
}

function createGates(app: FastifyInstance): InstallGates {
  const timeWindow = DURATION_MS.hour;
  return {
    perAddress: new RateLimitGate(
      app.createRateLimit({ max: LIMITS.requestsPerAddress, timeWindow })),
    perInstall: new RateLimitGate(app.createRateLimit({
      max: LIMITS.uploadsPerInstall, timeWindow, keyGenerator: installIdOf,
    })),
    newInstalls: new RateLimitGate(
      app.createRateLimit({ max: LIMITS.newInstallsPerAddress, timeWindow })),
  };
}

/** The CLI's side of shared journals: upload a batch, withdraw consent. Every request is signed. */
class InstallEndpoints {
  readonly #deps: AppDeps;
  readonly #verifier: InstallSignatureVerifier;
  readonly #gates: InstallGates;

  constructor(deps: AppDeps, gates: InstallGates) {
    this.#deps = deps;
    this.#verifier = new InstallSignatureVerifier(deps.config.publicOrigin, deps.clock);
    this.#gates = gates;
  }

  register(app: FastifyInstance): void {
    app.addHook("onRequest", (request) => this.#gates.perAddress.enforce(request));
    app.post(LOGS_PATH, { bodyLimit: FIELD_RULES.batch.maxBodyBytes }, this.upload);
    app.delete(INSTALL_PATH, this.erase);
  }

  readonly upload = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.#isAuthentic(request)) return sendApiError(reply, UNAUTHORIZED);
    await this.#gates.perInstall.enforce(request);
    const validation = validateLogBatch(parseJson(rawBodyOf(request)));
    if (!validation.ok && validation.error === "too_large") {
      const { message } = validation;
      const status = HTTP_STATUS.payloadTooLarge;
      return sendApiError(reply, { status, error: "too_large", message });
    }
    if (!validation.ok) return invalidBatch(reply, validation.fields);
    const accepted = await this.#store(request, validation.value);
    return reply.code(HTTP_STATUS.accepted).send({ accepted });
  };

  /** Idempotent: an unknown install answers 204 like an erased one. */
  readonly erase = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.#isAuthentic(request)) return sendApiError(reply, UNAUTHORIZED);
    await this.#deps.installs.remove(installIdOf(request));
    return reply.code(HTTP_STATUS.noContent).send();
  };

  /** Stores the batch; a new install counts against its address only once created. */
  async #store(request: FastifyRequest, batch: LogBatch) {
    const { newInstalls } = this.#gates;
    const mayCreateInstall = !(await newInstalls.isExhausted(request));
    const installId = installIdOf(request);
    const outcome = await this.#deps.installs.storeBatch({ installId, batch, mayCreateInstall });
    if (outcome.kind === "creation_refused") {
      throw new HttpError(HTTP_STATUS.tooManyRequests, "Too many new installs from this address.");
    }
    if (outcome.isNewInstall) await newInstalls.count(request);
    return outcome.accepted;
  }

  #isAuthentic(request: FastifyRequest): boolean {
    return this.#verifier.isAuthentic({
      authorization: request.headers.authorization,
      method: request.method,
      pathname: request.url.split("?")[0] ?? "",
      installId: installIdOf(request),
      body: rawBodyOf(request),
    });
  }
}

/**
 * Mounted in its own scope: the JSON parser is replaced by a raw one here
 * only, since the signature covers the body's exact bytes.
 */
export function installRoutes(deps: AppDeps) {
  return async (app: FastifyInstance): Promise<void> => {
    app.removeAllContentTypeParsers();
    app.addContentTypeParser("application/json", { parseAs: "buffer" },
      (_request, body, done) => done(null, body));
    new InstallEndpoints(deps, createGates(app)).register(app);
  };
}
