/** Where the relay connects, without anything secret the URL may carry. */
export interface SmtpEndpoint {
  readonly host: string;
  readonly port: number;
  /** The URL names no port: nodemailer's default for the scheme applies. */
  readonly isDefaultPort: boolean;
  /** `smtps://`: TLS from the first byte; otherwise STARTTLS when the server offers it. */
  readonly isImplicitTls: boolean;
}

const IMPLICIT_TLS_SCHEME = "smtps:";
/** nodemailer's defaults: 465 with implicit TLS, 587 otherwise. */
const DEFAULT_PORT = { implicitTls: 465, plain: 587 } as const;

/**
 * Host, port and TLS mode of an `SMTP_URL`. User name and password are never
 * read: they stay in the URL, which never leaves the configuration.
 */
export function smtpEndpoint(smtpUrl: string): SmtpEndpoint {
  const url = new URL(smtpUrl);
  const isImplicitTls = url.protocol === IMPLICIT_TLS_SCHEME;
  const fallback = isImplicitTls ? DEFAULT_PORT.implicitTls : DEFAULT_PORT.plain;
  return {
    host: url.hostname,
    port: url.port === "" ? fallback : Number(url.port),
    isDefaultPort: url.port === "",
    isImplicitTls,
  };
}
