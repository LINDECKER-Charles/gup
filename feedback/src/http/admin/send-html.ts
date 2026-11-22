import type { FastifyReply } from "fastify";
import { HTTP_STATUS } from "../http-status.js";

export function sendHtml(
  reply: FastifyReply,
  page: string,
  status: number = HTTP_STATUS.ok,
): FastifyReply {
  return reply.code(status).type("text/html; charset=utf-8").send(page);
}
