import type { FastifyInstance } from "fastify";
import type { HealthProbe } from "../../ports/health-probe.js";
import { HTTP_STATUS } from "../http-status.js";
import { sendApiError } from "./api-error.js";

/** Polled every 30 s by the container healthcheck: its access lines would drown the log. */
const PROBE_LOG_LEVEL = "warn";

/** Container healthcheck and deployment probe: up only when the database answers. */
export function registerHealthRoute(app: FastifyInstance, health: HealthProbe): void {
  app.get("/healthz", { logLevel: PROBE_LOG_LEVEL }, async (_request, reply) => {
    if (await health.isHealthy()) return reply.send({ status: "ok" });
    return sendApiError(reply, {
      status: HTTP_STATUS.serviceUnavailable,
      error: "unavailable",
      message: "The database does not answer.",
    });
  });
}
