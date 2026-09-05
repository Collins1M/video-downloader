import { createServer } from "node:http";
import * as client from "prom-client";
import { logger } from "./logger";

export const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "worker_" });

export const jobsProcessedTotal = new client.Counter({
  name: "worker_jobs_processed_total",
  help: "Total number of jobs completed successfully",
  registers: [register],
});

export const jobsFailedTotal = new client.Counter({
  name: "worker_jobs_failed_total",
  help: "Total number of jobs that ended in permanent failure (retries exhausted, or unrecoverable)",
  registers: [register],
});

export const jobsRetriedTotal = new client.Counter({
  name: "worker_jobs_retried_total",
  help: "Total number of transient failures that triggered a retry (job requeued, not yet failed)",
  registers: [register],
});

export const jobProcessingDuration = new client.Histogram({
  name: "worker_job_processing_duration_seconds",
  help: "Wall-clock time from job start to a terminal (completed/failed) state",
  buckets: [1, 5, 15, 30, 60, 120, 300, 600],
  registers: [register],
});

/**
 * A dedicated HTTP server for exactly one route (/metrics) — not a
 * general-purpose server. The worker deliberately has no other HTTP
 * surface (see apps/worker README); this exists purely so Prometheus
 * can scrape it.
 */
export function startMetricsServer(port: number): void {
  const server = createServer((req, res) => {
    if (req.url === "/metrics") {
      register
        .metrics()
        .then((body) => {
          res.setHeader("Content-Type", register.contentType);
          res.end(body);
        })
        .catch((err) => {
          res.statusCode = 500;
          res.end("Failed to collect metrics");
          logger.error({ err }, "Failed to collect metrics");
        });
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(port, () => {
    logger.info({ port }, "Metrics server listening on /metrics");
  });
}
