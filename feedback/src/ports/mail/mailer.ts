export interface OutgoingMail {
  readonly to: string;
  readonly from: string;
  readonly replyTo: string | null;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}
