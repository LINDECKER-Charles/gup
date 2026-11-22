import { createTransport, type Transporter } from "nodemailer";
import type { Mailer, OutgoingMail } from "../ports/mail/mailer.js";
import { DURATION_MS } from "../time-units.js";

/**
 * Well under the outbox lease (5 minutes): a hung relay fails the attempt
 * long before another worker could claim the same mail.
 */
const TIMEOUTS = {
  connectionTimeout: 30 * DURATION_MS.second,
  greetingTimeout: 30 * DURATION_MS.second,
  socketTimeout: 60 * DURATION_MS.second,
} as const;

export class NodemailerMailer implements Mailer {
  readonly #transport: Transporter;

  constructor(smtpUrl: string) {
    this.#transport = createTransport({ url: smtpUrl, ...TIMEOUTS });
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.#transport.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo === null ? {} : { replyTo: mail.replyTo }),
    });
  }
}
