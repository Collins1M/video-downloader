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

    if (exception instanceof AppException) {
      response.status(exception.getStatus()).json({
        success: false,
        message: exception.message,
        code: exception.code,
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

      response.status(status).json({
        success: false,
        message,
        code: status === HttpStatus.BAD_REQUEST ? "INVALID_URL" : "INTERNAL_ERROR",
      });
      return;
    }

    // Unknown/unexpected error: log full detail server-side, tell the
    // user nothing but a generic message. Worth alerting on (unlike
    // AppExceptions above, which are expected, user-facing outcomes) —
    // this branch means something we didn't anticipate broke.
    const request = ctx.getRequest<Request & { id?: string }>();
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    captureUnexpectedError(exception, { requestId: request.id, path: request.path });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong while preparing your download. Please try again.",
      code: "INTERNAL_ERROR",
    });
  }
}
