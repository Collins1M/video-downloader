import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import type { AdminStats, AdminChartsResponse, ChartPoint, VideoProcessingJobData } from "@video-downloader/types";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { PrismaService } from "../prisma/prisma.service";

const CHART_WINDOW_DAYS = 14;

interface DayCountRow {
  day: Date;
  count: bigint;
}

interface DaySumRow {
  day: Date;
  total: bigint | null;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE) private readonly queue: Queue<VideoProcessingJobData>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const [totalRequests, activeDownloads, completedDownloads, failedDownloads, bandwidth, avgProcessing, activeWorkers] =
      await Promise.all([
        this.prisma.downloadJob.count(),
        this.prisma.downloadJob.count({ where: { status: { in: ["queued", "processing"] } } }),
        this.prisma.downloadJob.count({ where: { status: "completed" } }),
        this.prisma.downloadJob.count({ where: { status: "failed" } }),
        this.prisma.downloadJob.aggregate({
          where: { status: "completed" },
          _sum: { fileSize: true },
        }),
        this.averageProcessingTimeSeconds(),
        this.getActiveWorkerCount(),
      ]);

    return {
      totalRequests,
      activeDownloads,
      completedDownloads,
      failedDownloads,
      bandwidthBytes: bandwidth._sum.fileSize ?? 0,
      averageProcessingTimeSeconds: avgProcessing,
      activeWorkers,
    };
  }

  async getCharts(): Promise<AdminChartsResponse> {
    const since = new Date(Date.now() - CHART_WINDOW_DAYS * 24 * 60 * 60_000);

    const [downloadRows, errorRows, bandwidthRows] = await Promise.all([
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "download_jobs"
        WHERE "createdAt" >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "download_jobs"
        WHERE "createdAt" >= ${since} AND status = 'failed'
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<DaySumRow[]>`
        SELECT date_trunc('day', "completedAt") AS day, SUM("fileSize")::bigint AS total
        FROM "download_jobs"
        WHERE "completedAt" >= ${since} AND status = 'completed'
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    return {
      downloadsPerDay: fillDayGaps(
        downloadRows.map((r: DayCountRow) => ({ date: toDateKey(r.day), value: Number(r.count) })),
        since,
      ),
      errorsPerDay: fillDayGaps(
        errorRows.map((r: DayCountRow) => ({ date: toDateKey(r.day), value: Number(r.count) })),
        since,
      ),
      bandwidthPerDay: fillDayGaps(
        bandwidthRows.map((r: DaySumRow) => ({ date: toDateKey(r.day), value: Number(r.total ?? 0) })),
        since,
      ),
    };
  }

  private async averageProcessingTimeSeconds(): Promise<number | null> {
    const result = await this.prisma.$queryRaw<{ avg_seconds: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")))::float AS avg_seconds
      FROM "download_jobs"
      WHERE status = 'completed' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL
    `;
    const value = result[0]?.avg_seconds;
    return value === null || value === undefined ? null : Math.round(value);
  }

  private async getActiveWorkerCount(): Promise<number> {
    try {
      const workers = await this.queue.getWorkers();
      return workers.length;
    } catch {
      // Redis CLIENT LIST can be restricted in some managed Redis
      // setups — degrade to "unknown" rather than failing the whole
      // stats endpoint over one non-critical metric.
      return 0;
    }
  }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fills in zero-value days so charts don't have gaps where nothing happened. */
function fillDayGaps(points: ChartPoint[], since: Date): ChartPoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const result: ChartPoint[] = [];
  const cursor = new Date(since);
  cursor.setUTCHours(0, 0, 0, 0);
  const today = new Date();

  while (cursor <= today) {
    const key = toDateKey(cursor);
    result.push({ date: key, value: byDate.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}
