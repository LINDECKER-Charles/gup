/**
 * An error that carries its HTTP status. Each scope renders it its own way:
 * JSON for the API, an HTML page for the back office.
 */
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

/** What an error handler receives: any error, with a status when it carries one. */
export type HttpFailure = Error & { readonly statusCode?: number | undefined };
