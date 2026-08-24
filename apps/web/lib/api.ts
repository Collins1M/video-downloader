import type {
  AnalyzeResponse,
  CreateDownloadResponse,
  JobStatusResponse,
  ApiErrorResponse,
} from "@video-downloader/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  code: string;
  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.code = response.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include", // sends/receives the anonymous session_id cookie (Section 17)
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    // The API always returns { success: false, message, code } on
    // failure (Section 18) — we just relay it, never invent our own
    // wording for a server-side error.
    let body: ApiErrorResponse;
    try {
      body = await res.json();
    } catch {
      body = { success: false, message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" };
    }
    throw new ApiError(body);
  }

  return res.json() as Promise<T>;
}

export function analyzeVideo(url: string): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/video/analyze", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function createDownload(url: string, formatId: string): Promise<CreateDownloadResponse> {
  return request<CreateDownloadResponse>("/video/download", {
    method: "POST",
    body: JSON.stringify({ url, formatId }),
  });
}

export function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/video/jobs/${jobId}`);
}

export function cancelJob(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/video/jobs/${jobId}`, { method: "DELETE" });
}

export function getJobFileUrl(jobId: string): string {
  return `${API_BASE_URL}/video/jobs/${jobId}/file`;
}

export function getJobEventsUrl(jobId: string): string {
  return `${API_BASE_URL}/video/jobs/${jobId}/events`;
}
