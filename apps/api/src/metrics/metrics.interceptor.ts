import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { Request, Response } from "express";
import { MetricsService } from "./metrics.service";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const start = process.hrtime.bigint();

    // route.path (e.g. "/video/jobs/:id") rather than the raw URL, so a
    // thousand distinct job ids don't become a thousand distinct
    // Prometheus label combinations (a classic cardinality footgun).
    const route = request.route?.path ?? request.path;

    const record = () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = { method: request.method, route, status_code: String(response.statusCode) };
      this.metrics.httpRequestsTotal.inc(labels);
      this.metrics.httpRequestDuration.observe(labels, durationSeconds);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
