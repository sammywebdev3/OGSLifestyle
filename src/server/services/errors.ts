import 'server-only';

/** Errors a service can return to an API route, with an HTTP status. */
export class ServiceError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: string[]) {
    super(message);
  }
}
