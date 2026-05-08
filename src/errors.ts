/**
 * Thrown by every SDK method when the API returns a non-2xx response or the
 * underlying transport fails before a response is received.
 *
 * - `status` is the HTTP status code (0 for transport failures).
 * - `body` is the raw response body (often RFC 7807 JSON; clients can `JSON.parse` if they need the `code` field).
 * - `path` is the API path that produced the error, useful for logging.
 *
 * The Neural Draft API returns `application/problem+json` for errors with a
 * stable machine-readable `code` (e.g. `out_of_credits`, `validation_failed`).
 * Branch on `code` rather than the `title` or HTTP status alone.
 *
 * @example
 *   try {
 *     await client.blogPosts.generateAi({ topic: "..." });
 *   } catch (err) {
 *     if (err instanceof ApiError && err.status === 402) {
 *       // out of credits — direct user to top up
 *     } else {
 *       throw err;
 *     }
 *   }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(status: number, body: string, path: string) {
    super(`Neural Draft API ${status} on ${path}: ${body.slice(0, 500)}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}
