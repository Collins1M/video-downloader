import { execFile } from "node:child_process";
import {
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
} from "./errors";

export interface RunYtDlpOptions {
  timeoutMs: number;
  maxBufferBytes?: number;
  cookiesPath?: string;
}


/**
 * Core arguments to bypass bot detection and 403 Forbidden errors.
 * --impersonate chrome: mimics a real browser's TLS fingerprint and headers.
 */
const STEALTH_ARGS = [
  "--impersonate",
  "chrome",
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "--add-header",
  "Accept-Language: en-US,en;q=0.9",
];

export function runYtDlp(args: string[], options: RunYtDlpOptions): Promise<string> {
  const finalArgs = [...STEALTH_ARGS, ...args];
  if (options.cookiesPath) {
    finalArgs.unshift("--cookies", options.cookiesPath);
  }

  // Use the URL (usually the last arg) as the referer to bypass some 403 blocks
  const lastArg = args[args.length - 1];
  if (lastArg?.startsWith("http")) {
    finalArgs.unshift("--referer", lastArg);
  }

  const startTime = Date.now();
  console.log(`[YtDlp] Executing: yt-dlp ${finalArgs.join(" ")}`);

  return new Promise((resolvePromise, reject) => {
    execFile(
      "yt-dlp",
      finalArgs,
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes ?? 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        console.log(`[YtDlp] Finished in ${duration}ms`);

        if (!error) {
          resolvePromise(stdout);
          return;
        }

        console.error(`[YtDlp] Command failed after ${duration}ms:`, stderr);

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

export async function fetchYtDlpInfo(
  url: string,
  timeoutMs: number,
  cookiesPath?: string,
): Promise<YtDlpInfo> {
  const stdout = await runYtDlp(
    ["--dump-single-json", "--no-warnings", "--no-playlist", "--no-check-certificates", "--", url],
    { timeoutMs, cookiesPath },
  );

  try {
    return JSON.parse(stdout) as YtDlpInfo;
  } catch {
    throw new ExtractionFailedError("yt-dlp returned non-JSON output");
  }
}


export async function fetchYtDlpFormat(
  url: string,
  ytDlpFormatId: string,
  outputPath: string,
  timeoutMs: number,
  cookiesPath?: string,
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
    { timeoutMs, cookiesPath },
  );
}



export interface YtDlpFormat {
  format_id: string;
  ext: string;
  height?: number | null;
  vcodec?: string;
  acodec?: string;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null; 
  abr?: number | null; 
  protocol?: string;
}

export interface YtDlpInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  webpage_url?: string;
  extractor_key?: string;
  formats: YtDlpFormat[];
}
