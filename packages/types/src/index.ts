// Shared contracts between apps/web, apps/api, and apps/worker.
// Keep this package framework-agnostic (no Nest/Next imports).

export type MediaKind = "video" | "audio";

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number; // seconds
  source: string; // domain
}

export interface FormatOption {
  id: string; // e.g. "1080-mp4"
  type: MediaKind;
  container: string; // "mp4" | "mp3" | ...
  resolution?: string; // "1080p", present for video
  bitrateKbps?: number; // present for audio
  estimatedSize?: number; // bytes, optional
}

export interface AnalyzeRequest {
  url: string;
}

export interface AnalyzeResponse {
  success: boolean;
  video: VideoInfo;
  formats: FormatOption[];
}

export interface CreateDownloadRequest {
  url: string;
  formatId: string;
}

export interface CreateDownloadResponse {
  jobId: string;
  // If the format can be streamed directly, the API may skip queueing
  // and respond with a redirect/stream instead of a jobId.
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  progress: number; // 0-100
  error?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code:
    | "INVALID_URL"
    | "UNSUPPORTED_SOURCE"
    | "VIDEO_UNAVAILABLE"
    | "PROCESSING_FAILED"
    | "FILE_TOO_LARGE"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "JOB_NOT_READY"
    | "FILE_EXPIRED"
    | "INTERNAL_ERROR";
}

// --- Queue contract (Phase 5) ---
// Shared between apps/api (producer) and apps/worker (consumer) so both
// sides agree on the queue name and job payload shape without either
// depending on the other's source.

export const VIDEO_PROCESSING_QUEUE = "video-processing";

export interface VideoProcessingJobData {
  /** Matches DownloadJob.id in Postgres — the worker updates this row. */
  downloadJobId: string;
  sourceUrl: string;
  formatId: string;
  /** The API request id that created this job (Phase 12 correlation — see apps/api's pino-http request logging). Lets an operator trace a browser request through api logs, the queue, and worker logs as one thread. */
  requestId?: string;
}

// --- Admin dashboard (Phase 8) ---

export interface AdminStats {
  totalRequests: number;
  activeDownloads: number;
  completedDownloads: number;
  failedDownloads: number;
  bandwidthBytes: number;
  averageProcessingTimeSeconds: number | null;
  activeWorkers: number;
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface AdminChartsResponse {
  downloadsPerDay: ChartPoint[];
  errorsPerDay: ChartPoint[];
  bandwidthPerDay: ChartPoint[];
}
