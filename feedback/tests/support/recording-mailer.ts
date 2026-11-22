import type { Mailer, OutgoingMail } from "../../src/ports/mail/mailer.js";

/** Keeps what it is asked to send; fails with `failure` when one is set. */
export class RecordingMailer implements Mailer {
  readonly sent: OutgoingMail[] = [];
  failure: Error | null = null;

  async send(mail: OutgoingMail): Promise<void> {
    if (this.failure !== null) throw this.failure;
    this.sent.push(mail);
  }
}
