import { execFile } from "node:child_process";
import {
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
} from "./errors";

export interface RunYtDlpOptions {
  /** Hard kill after this many ms (Section 13: maximum processing duration). */
  timeoutMs: number;
  /** Cap on stdout/stderr buffered in memory. */
  maxBufferBytes?: number;
}

/**
 * Runs `yt-dlp` with a fixed, internally-constructed argument list and
 * returns stdout. The URL and any other dynamic values are always passed
 * as separate argv entries via execFile — never interpolated into a
 * shell string — so nothing the user supplies can inject additional
 * flags or shell metacharacters (Section 11: "Do not allow user input to
 * become arbitrary shell/FFmpeg commands").
 */
export function runYtDlp(args: string[], options: RunYtDlpOptions): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "yt-dlp",
      args,
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes ?? 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolvePromise(stdout);
          return;
        }

        if ((error as { killed?: boolean }).killed || error.signal === "SIGTERM") {
          reject(new ExtractionTimeoutError(stderr));
          return;
        }

        const lowerStderr = stderr.toLowerCase();
        if (lowerStderr.includes("unsupported url")) {
          reject(new UnsupportedSourceError(stderr));
          return;
        }
        if (
          lowerStderr.includes("video unavailable") ||
          lowerStderr.includes("private video") ||
          lowerStderr.includes("this video is unavailable") ||
          lowerStderr.includes("content isn't available") ||
          lowerStderr.includes("sign in to confirm")
        ) {
          reject(new VideoUnavailableError(stderr));
          return;
        }

        reject(new ExtractionFailedError(stderr));
      },
    );
  });
}

/** Fetches full metadata + format list for a URL as parsed JSON. */
export async function fetchYtDlpInfo(url: string, timeoutMs: number): Promise<YtDlpInfo> {
  const stdout = await runYtDlp(
    ["--dump-single-json", "--no-warnings", "--no-playlist", "--no-check-certificates", "--", url],
    { timeoutMs },
  );

  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new ExtractionFailedError("yt-dlp returned non-JSON output");
  }
}

/**
 * Downloads one specific format to `outputPath`. Used by the worker at
 * processing time, never by anything that takes formatId from a raw
 * request body — the caller resolves formatId to a concrete yt-dlp
 * format id via resolveFormatTarget() first (see format-mapper.ts),
 * which only ever returns values yt-dlp itself reported as available.
 */
export async function fetchYtDlpFormat(
  url: string,
  ytDlpFormatId: string,
  outputPath: string,
  timeoutMs: number,
): Promise<void> {
  await runYtDlp(
    [
      "-f",
      ytDlpFormatId,
      "-o",
      outputPath,
      "--no-warnings",
      "--no-playlist",
      "--no-check-certificates",
      "--no-part",
      "--",
      url,
    ],
    { timeoutMs },
  );
}


// Minimal shape of what we actually read from yt-dlp's JSON output.
// yt-dlp's real output has many more fields; we only type what we use.
export interface YtDlpFormat {
  format_id: string;
  ext: string;
  height?: number | null;
  vcodec?: string;
  acodec?: string;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null; // total bitrate, kbps
  abr?: number | null; // audio bitrate, kbps
  protocol?: string;
}

export interface YtDlpInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number; // seconds
  webpage_url?: string;
  extractor_key?: string;
  formats: YtDlpFormat[];
}
