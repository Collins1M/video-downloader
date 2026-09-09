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

@Injectable()
export class QueueEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private queueEvents!: QueueEvents;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.queueEvents = new QueueEvents(VIDEO_PROCESSING_QUEUE, {
      connection: {
        maxRetriesPerRequest: null,
        ...parseRedisUrl(this.config.getOrThrow<string>("REDIS_URL")),
      },
    });

    this.queueEvents.setMaxListeners(500);

    this.queueEvents.on("error", (err) =>
      this.logger.error(`QueueEvents connection error: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
  }


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
