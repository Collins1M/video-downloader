import { Injectable, Logger, type MessageEvent, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueEvents } from "bullmq";
import { Observable } from "rxjs";
import { VIDEO_PROCESSING_QUEUE, type JobStatus } from "@video-downloader/types";

export interface JobEventPayload {
  jobId: string;
  status: JobStatus;
  progress: number;
  error?: string;
}

/**
 * Wraps a single BullMQ QueueEvents connection (its own dedicated Redis
 * subscriber, per BullMQ's requirements — this is distinct from the
 * BullModule-managed connection used for enqueueing) and fans out
 * per-jobId progress/completed/failed notifications as RxJS Observables.
 *
 * One QueueEvents instance is shared for the whole process rather than
 * one per open SSE connection: BullMQ's Redis pub/sub subscription is
 * already global to the queue, so instantiating QueueEvents per-request
 * would open one extra Redis connection per concurrent SSE stream for no
 * benefit — we just filter the shared event stream by jobId per listener.
 */
@Injectable()
export class QueueEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private queueEvents!: QueueEvents;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.queueEvents = new QueueEvents(VIDEO_PROCESSING_QUEUE, {
      connection: {
        // QueueEvents needs its own ioredis-compatible connection options
        // (not a shared client instance) so it can run in subscriber mode
        // independently of the producer connection in QueueConnectionModule.
        maxRetriesPerRequest: null,
        // Rebuilt from the same REDIS_URL as the producer connection —
        // ioredis accepts either a URL string or an options object, but
        // BullMQ's QueueEvents constructor here expects options, so we
        // parse it once at startup.
        ...parseRedisUrl(this.config.getOrThrow<string>("REDIS_URL")),
      },
    });

    // Increase limit to prevent MaxListenersExceededWarning under load.
    // Each concurrent SSE stream adds 3 listeners (progress, completed, failed).
    this.queueEvents.setMaxListeners(500);

    this.queueEvents.on("error", (err) =>
      this.logger.error(`QueueEvents connection error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
  }

  /**
   * Emits one JobEventPayload per progress update and exactly one
   * terminal payload (completed/failed), then completes the Observable.
   * `initial` is emitted synchronously first so a client that connects
   * after the job already has a status doesn't wait for the next Redis
   * event to see anything.
   */
  streamJobEvents(jobId: string, initial: JobEventPayload): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let lastPayload = initial;
      subscriber.next({ data: lastPayload });

      if (initial.status === "completed" || initial.status === "failed" || initial.status === "cancelled") {
        subscriber.complete();
        return () => {};
      }

      const onProgress = ({ jobId: id, data }: { jobId: string; data: import("bullmq").JobProgress }) => {
        if (id !== jobId || typeof data !== "number") return;
        lastPayload = { jobId, status: "processing", progress: data } satisfies JobEventPayload;
        subscriber.next({ data: lastPayload });
      };

      const onCompleted = ({ jobId: id }: { jobId: string; returnvalue: string }) => {
        if (id !== jobId) return;
        lastPayload = { jobId, status: "completed", progress: 100 } satisfies JobEventPayload;
        subscriber.next({ data: lastPayload });
        subscriber.complete();
      };

      const onFailed = ({ jobId: id, failedReason }: { jobId: string; failedReason: string }) => {
        if (id !== jobId) return;
        lastPayload = {
          jobId,
          status: "failed",
          progress: lastPayload.progress,
          error: failedReason,
        } satisfies JobEventPayload;
        subscriber.next({ data: lastPayload });
        subscriber.complete();
      };

      this.queueEvents.on("progress", onProgress);
      this.queueEvents.on("completed", onCompleted);
      this.queueEvents.on("failed", onFailed);

      const heartbeatInterval = setInterval(() => {
        // Periodic heartbeat to prevent proxy timeouts (Nginx/Cloudflare)
        // during long extraction phases with no progress updates.
        subscriber.next({ data: lastPayload });
      }, 15000);

      return () => {
        clearInterval(heartbeatInterval);
        this.queueEvents.off("progress", onProgress);
        this.queueEvents.off("completed", onCompleted);
        this.queueEvents.off("failed", onFailed);
      };
    });
  }
}

function parseRedisUrl(url: string): { host: string; port: number; username?: string; password?: string; db?: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
  };
}
