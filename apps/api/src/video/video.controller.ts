import {
  Body,
  Controller,
  Delete,
  Get,
  type MessageEvent,
  Param,
  Post,
  Res,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiProduces } from "@nestjs/swagger";
import type { Response } from "express";
import type { Observable } from "rxjs";
import { createReadStream, promises as fs } from "node:fs";
import { extname } from "node:path";
import type {
  AnalyzeResponse,
  CreateDownloadResponse,
  JobStatusResponse,
} from "@video-downloader/types";
import { VideoService } from "./video.service";
import { AnalyzeRequestDto } from "./dto/analyze-request.dto";
import { CreateDownloadRequestDto } from "./dto/create-download-request.dto";
import { ClientIp } from "../common/security/client-ip.decorator";
import { SessionId } from "../common/security/session-id.decorator";
import { RequestId } from "../common/logging/request-id.decorator";
import { ConcurrentJobsGuard } from "../common/security/concurrent-jobs.guard";
import { JobExistsGuard } from "./job-exists.guard";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

@ApiTags("video")
@Controller("video")
@SkipThrottle({ general: true, download: true, polling: true }) // opt in per route below — no route is throttled by accident, none is un-throttled by accident either
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post("analyze")
  @Throttle({ general: {} })
  @ApiOperation({
    summary: "Analyze a video URL and list its downloadable formats",
    description:
      "Fetches metadata for the given video page (title, thumbnail, duration) and the set of " +
      "formats available to download. Does not start a download or create a job.",
  })
  @ApiResponse({ status: 201, description: "Video metadata and available formats." })
  @ApiResponse({ status: 400, description: "Missing or malformed url." })
  @ApiResponse({ status: 404, description: "The video couldn't be found or accessed." })
  @ApiResponse({ status: 422, description: "This video source isn't supported." })
  @ApiResponse({ status: 429, description: "Rate limit exceeded for this tier." })
  analyze(@Body() dto: AnalyzeRequestDto): Promise<AnalyzeResponse> {
    return this.videoService.analyze(dto.url);
  }

  @Post("download")
  @Throttle({ download: {} })
  @UseGuards(ConcurrentJobsGuard)
  @ApiOperation({
    summary: "Start a download job for a chosen format",
    description:
      "Creates a DownloadJob and enqueues it for background processing. Poll " +
      "GET /video/jobs/:id or subscribe to GET /video/jobs/:id/events to track progress.",
  })
  @ApiResponse({ status: 201, description: "The created job's id." })
  @ApiResponse({ status: 400, description: "Missing/malformed url or formatId." })
  @ApiResponse({
    status: 403,
    description: "Too many concurrent jobs already in progress for this IP.",
  })
  @ApiResponse({ status: 429, description: "Rate limit exceeded for this tier." })
  createDownload(
    @Body() dto: CreateDownloadRequestDto,
    @ClientIp() ip: string,
    @SessionId() sessionId: string,
    @RequestId() requestId: string | undefined,
  ): Promise<CreateDownloadResponse> {
    return this.videoService.createDownload(dto.url, dto.formatId, ip, sessionId, requestId);
  }

  @Get("jobs/:id")
  @Throttle({ polling: {} })
  @ApiOperation({ summary: "Get a download job's current status" })
  @ApiParam({ name: "id", description: "The job id returned by POST /video/download." })
  @ApiResponse({ status: 200, description: "Current status and progress of the job." })
  @ApiResponse({ status: 404, description: "No job with that id." })
  @ApiResponse({ status: 429, description: "Rate limit exceeded for this tier." })
  getJob(@Param("id") id: string): Promise<JobStatusResponse> {
    return this.videoService.getJobStatus(id);
  }

  @Delete("jobs/:id")
  @Throttle({ polling: {} })
  @ApiOperation({ summary: "Cancel an in-progress download job" })
  @ApiParam({ name: "id", description: "The job id to cancel." })
  @ApiResponse({ status: 200, description: "The job's status after cancellation." })
  @ApiResponse({ status: 404, description: "No job with that id." })
  cancelJob(@Param("id") id: string): Promise<JobStatusResponse> {
    return this.videoService.cancelJob(id);
  }

  /**
   * Live progress as Server-Sent Events, replacing client-side polling
   * (Phase 14, item 19). Existence is checked in JobExistsGuard rather
   * than inside this handler — see the guard's docstring for why that
   * split matters for @Sse() specifically.
   */
  @Get("jobs/:id/events")
  @Sse()
  @Throttle({ polling: {} })
  @UseGuards(JobExistsGuard)
  @ApiOperation({
    summary: "Subscribe to a job's live progress via Server-Sent Events",
    description:
      "text/event-stream. Emits the job's current status immediately, then a message per " +
      "progress update, then one final completed/failed/cancelled message before closing. " +
      "Swagger UI can't execute SSE requests interactively — try this one with curl or the browser.",
  })
  @ApiParam({ name: "id", description: "The job id to stream events for." })
  @ApiProduces("text/event-stream")
  @ApiResponse({ status: 200, description: "SSE stream of JobEventPayload messages." })
  @ApiResponse({ status: 404, description: "No job with that id." })
  jobEvents(@Param("id") id: string): Promise<Observable<MessageEvent>> {
    return this.videoService.streamJobEvents(id);
  }

  /**
   * Streams a completed job's output straight to the browser (Section 8)
   * and deletes the temp file once the response finishes — successfully
   * or not — so nothing lingers beyond the download itself (Section 9).
   */
  @Get("jobs/:id/file")
  @Throttle({ general: {} })
  @ApiOperation({
    summary: "Download a completed job's output file",
    description: "Streams the file and deletes it from temp storage once the response finishes.",
  })
  @ApiParam({ name: "id", description: "The completed job's id." })
  @ApiProduces("video/mp4", "audio/mpeg", "application/octet-stream")
  @ApiResponse({ status: 200, description: "The file, streamed as an attachment." })
  @ApiResponse({ status: 404, description: "No job with that id." })
  @ApiResponse({ status: 409, description: "The job hasn't finished processing yet." })
  @ApiResponse({ status: 410, description: "The job's file already expired and was deleted." })
  async downloadFile(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const { path, filename } = await this.videoService.getJobFilePath(id);
    const stat = await fs.stat(path);
    const contentType = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const cleanup = () => {
      fs.unlink(path).catch(() => {
        /* already gone, or TTL sweep beat us to it — fine either way */
      });
    };

    const stream = createReadStream(path);
    stream.on("error", cleanup);
    res.on("close", cleanup);
    res.on("finish", cleanup);

    stream.pipe(res);
  }
}
