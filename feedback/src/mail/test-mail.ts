import type { MailConfig } from "../config/app-config.js";
import type { OutgoingMail } from "../ports/mail/mailer.js";
import { formatDate } from "../views/text/format-date.js";

export interface TestMailInput {
  readonly mail: MailConfig;
  readonly publicOrigin: string;
  readonly sentAt: Date;
}

/** A plain mail to the notification recipient, proving the relay end to end. */
export function testMail(input: TestMailInput): OutgoingMail {
  const at = formatDate(input.sentAt, "second");
  return {
    to: input.mail.notifyTo,
    from: input.mail.from,
    replyTo: null,
    subject: `[gup] Mail de test du back office (${at})`,
    text: [
      `Ce mail de test a été demandé depuis le back office le ${at}.`,
      "",
      "S’il est arrivé, les notifications de nouveaux retours arriveront aussi : "
        + "même relais, même expéditeur, même destinataire.",
      "",
      `Back office : ${input.publicOrigin}/admin/mails`,
    ].join("\n"),
  };
}
