import type { MailConfig } from "../config/app-config.js";
import type { OutgoingMail } from "../ports/mail/mailer.js";
import { formatDate } from "../views/text/format-date.js";

export interface TestMailInput {
  readonly mail: MailConfig;
  /** Where the test goes: the notification address, or any the admin typed. */
  readonly to: string;
  /** The address feedback notifications go to now, named in the mail. */
  readonly notifyTo: string;
  readonly publicOrigin: string;
  readonly sentAt: Date;
}

/** A plain mail through the relay, proving it end to end. */
export function testMail(input: TestMailInput): OutgoingMail {
  const at = formatDate(input.sentAt, "second");
  const recipientLine = input.to === input.notifyTo
    ? "S’il est arrivé, les notifications de nouveaux retours arriveront aussi : "
      + "même relais, même expéditeur, même destinataire."
    : "S’il est arrivé, le relais et l’expéditeur fonctionnent. Les notifications de "
      + `nouveaux retours partent, elles, à ${input.notifyTo}.`;
  return {
    to: input.to,
    from: input.mail.from,
    replyTo: null,
    subject: `[gup] Mail de test du back office (${at})`,
    text: [
      `Ce mail de test a été demandé depuis le back office le ${at}.`,
      "",
      recipientLine,
      "",
      `Back office : ${input.publicOrigin}/admin/mails`,
    ].join("\n"),
  };
}
