export type MediaKind = "video" | "audio";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export interface VideoInfo {
    title: string;
    thumbnail: string;
    duration: number;
    source: string;
}
export interface FormatOption {
    id: string;
    type: MediaKind;
    container: string;
    resolution?: string;
    bitrateKbps?: number;
    estimatedSize?: number;
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
}
export interface JobStatusResponse {
    id: string;
    status: JobStatus;
    progress: number;
    error?: string;
}
export interface ApiErrorResponse {
    success: false;
    message: string;
    code: "INVALID_URL" | "UNSUPPORTED_SOURCE" | "VIDEO_UNAVAILABLE" | "PROCESSING_FAILED" | "FILE_TOO_LARGE" | "TIMEOUT" | "RATE_LIMITED" | "JOB_NOT_READY" | "FILE_EXPIRED" | "INTERNAL_ERROR";
}
export declare const VIDEO_PROCESSING_QUEUE = "video-processing";
export interface VideoProcessingJobData {
    /** Matches DownloadJob.id in Postgres — the worker updates this row. */
    downloadJobId: string;
    sourceUrl: string;
    formatId: string;
}
