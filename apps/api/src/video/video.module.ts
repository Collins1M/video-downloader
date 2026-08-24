import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { VideoController } from "./video.controller";
import { VideoService } from "./video.service";
import { MediaAnalyzer } from "./media-analyzer.interface";
import { YtDlpMediaAnalyzer } from "./yt-dlp-media-analyzer";
import { ConcurrentJobsGuard } from "../common/security/concurrent-jobs.guard";
import { JobExistsGuard } from "./job-exists.guard";
import { QueueEventsService } from "../queue/queue-events.service";

@Module({
  imports: [BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })],
  controllers: [VideoController],
  providers: [
    VideoService,
    ConcurrentJobsGuard,
    JobExistsGuard,
    QueueEventsService,
    {
      provide: MediaAnalyzer,
      useClass: YtDlpMediaAnalyzer,
    },
  ],
})
export class VideoModule {}
