import { Injectable } from "@nestjs/common";
import client from "prom-client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MetricsService {
  readonly registry = new client.Registry();

  readonly httpRequestsTotal = new client.Counter({
    name: "api_http_requests_total",
    help: "Total HTTP requests handled",
    labelNames: ["method", "route", "status_code"] as const,
    registers: [this.registry],
  });

  readonly httpRequestDuration = new client.Histogram({
    name: "api_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
    registers: [this.registry],
  });

  // Gauges refreshed at scrape time (see refreshJobGauges) rather than
  // incremented in-process — job completion happens in apps/worker, a
  // separate process, so "increment a counter when a job finishes"
  // isn't available here. Querying Postgres fresh on each scrape (same
  // pattern as AdminService's stats) is the standard, correct way to
  // expose state owned by another process.
  private readonly jobsByStatus = new client.Gauge({
    name: "download_jobs_by_status",
    help: "Current number of DownloadJob rows in each status",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  constructor(private readonly prisma: PrismaService) {
    client.collectDefaultMetrics({ register: this.registry, prefix: "api_" });
  }

  private async refreshJobGauges(): Promise<void> {
    const statuses = ["queued", "processing", "completed", "failed", "cancelled"] as const;
    const counts = await Promise.all(
      statuses.map((status) => this.prisma.downloadJob.count({ where: { status } })),
    );
    statuses.forEach((status, i) => this.jobsByStatus.set({ status }, counts[i]));
  }

  async getMetrics(): Promise<string> {
    await this.refreshJobGauges().catch(() => {
      // If Postgres is unreachable, still return the HTTP/process
      // metrics that don't depend on it rather than failing the whole
      // scrape — a DB outage shouldn't blind an operator to the rest
      // of the system's health too.
    });
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
