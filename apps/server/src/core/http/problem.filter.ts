import { PROBLEM_CONTENT_TYPE, ProblemDetails, problem, type ErrorCode } from '@agentshield/shared';
import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/** Closest api.md code for a bare Nest exception (route not found, body parse error...). */
function codeFor(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'NOT_OWNER';
  if (status === 409) return 'QUEUE_BUSY';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'CHAIN_UNAVAILABLE';
  return 'VALIDATION_ERROR';
}

/**
 * Every error leaves as RFC 9457 problem+json (api.md §1). Controllers throw HttpExceptions whose
 * body is already `problem(...)`; anything else (404 route, malformed JSON, a crash) is wrapped,
 * and a 500 never leaks its message.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ProblemDetails;
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const parsed = ProblemDetails.safeParse(exception.getResponse());
      body = parsed.success
        ? parsed.data
        : problem(codeFor(status), exception.message);
    } else {
      this.log.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
      body = problem('CHAIN_UNAVAILABLE', 'Internal error');
    }
    res.status(status).type(PROBLEM_CONTENT_TYPE).json({ ...body, status });
  }
}
