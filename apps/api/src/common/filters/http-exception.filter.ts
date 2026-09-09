import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response, Request } from "express";
import { AppException } from "../exceptions/app-exceptions";
import { captureUnexpectedError } from "../logging/sentry";

/**
 * Catches everything, everywhere. Guarantees the client only ever sees
 * { success: false, message, code } — never a stack trace, SQL error,
 * ffmpeg log line, or filesystem path (Section 18).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const request = ctx.getRequest<Request & { id?: string }>();

    if (exception instanceof AppException || (exception && typeof (exception as any).code === "string")) {
      const status =
        exception instanceof AppException
          ? exception.getStatus()
          : (exception as any).status || HttpStatus.INTERNAL_SERVER_ERROR;

      const code = (exception as any).code;
      const message = (exception as any).message;

      this.logger.warn({
        msg: `App error: ${code}`,
        detail: message,
        path: request.url,
        method: request.method,
        requestId: request.id,
      });

      response.status(status).json({
        success: false,
        message,
        code,
      });
      return;
    }

    if (exception instanceof HttpException) {
      // Standard Nest exceptions (e.g. class-validator 400s). Body-shape
      // details (which field failed) are fine to surface; internals are not.
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : Array.isArray((body as any)?.message)
            ? (body as any).message.join(" ")
            : ((body as any)?.message ?? "Request could not be processed.");

      this.logger.warn({
        msg: `HTTP error: ${status}`,
        detail: message,
        path: request.url,
        method: request.method,
        requestId: request.id,
      });

      response.status(status).json({
        success: false,
        message,
        code:
          status === HttpStatus.BAD_REQUEST
            ? "INVALID_URL"
            : status === HttpStatus.TOO_MANY_REQUESTS
              ? "RATE_LIMITED"
              : "INTERNAL_ERROR",
      });
      return;
    }

    // Unknown/unexpected error: log full detail server-side, tell the
    // user nothing but a generic message. Worth alerting on (unlike
    // AppExceptions above, which are expected, user-facing outcomes) —
    // this branch means something we didn't anticipate broke.
    this.logger.error({
      msg: exception instanceof Error ? exception.message : "Unexpected error",
      stack: exception instanceof Error ? exception.stack : undefined,
      path: request.url,
      method: request.method,
      requestId: request.id,
    });
    captureUnexpectedError(exception, { requestId: request.id, path: request.path });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while preparing your download. Please try again.",
      code: "INTERNAL_ERROR",
    });
  }
}
