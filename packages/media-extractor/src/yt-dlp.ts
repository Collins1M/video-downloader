import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
  AuthenticationRequiredError,
} from "./errors";

export interface RunYtDlpOptions {
  timeoutMs: number;
  maxBufferBytes?: number;
  cookiesPath?: string;
}


/**
 * Core arguments to bypass bot detection and 403 Forbidden errors.
 * --impersonate chrome: mimics a real browser's TLS fingerprint and headers.
 * NOTE: Requires `curl-cffi` to be installed in the Python environment.
 */
const STEALTH_ARGS = [
  "--impersonate",
  "chrome",
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "--add-header",
  "Accept-Language: en-US,en;q=0.9",
  "--add-header",
  "Sec-Fetch-Mode: navigate",
  "--add-header",
  "Sec-Fetch-Site: cross-site",
  "--add-header",
  "Sec-Fetch-Dest: document",
  "--no-check-certificates",
];

export async function runYtDlp(args: string[], options: RunYtDlpOptions): Promise<string> {
  const url = args[args.length - 1];
  const finalArgs = [...STEALTH_ARGS, ...args];

  // Use the URL (usually the last arg) as the referer to bypass some 403 blocks
  if (url?.startsWith("http")) {
    finalArgs.unshift("--referer", url);
  }

  const tempCookiesPath = await ensureCookieFile(url, options.cookiesPath);
  if (tempCookiesPath) {
    finalArgs.unshift("--cookies", tempCookiesPath);
  }

  const startTime = Date.now();
  console.log(`[YtDlp] Executing: yt-dlp ${finalArgs.join(" ")}`);

  try {
    const stdout = await new Promise<string>((resolvePromise, reject) => {
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
            lowerStderr.includes("you need to log in") ||
            lowerStderr.includes("sign in to confirm your age") ||
            lowerStderr.includes("use --cookies")
          ) {
            reject(new AuthenticationRequiredError(stderr));
            return;
          }
          if (
            lowerStderr.includes("video unavailable") ||
            lowerStderr.includes("private video") ||
            lowerStderr.includes("this video is unavailable") ||
            lowerStderr.includes("content isn't available") ||
            lowerStderr.includes("sign in to confirm") ||
            lowerStderr.includes("redirection detected") ||
            lowerStderr.includes("model is in a private show") ||
            lowerStderr.includes("room is currently offline")
          ) {
            reject(new VideoUnavailableError(stderr));
            return;
          }

          reject(new ExtractionFailedError(stderr));
        },
      );
    });
    return stdout;
  } finally {
    if (tempCookiesPath) {
      await fs.unlink(tempCookiesPath).catch((err) => {
        console.warn(`[YtDlp] Failed to delete temp cookies file ${tempCookiesPath}: ${err}`);
      });
    }
  }
}

async function ensureCookieFile(url: string, userCookiesPath?: string): Promise<string | undefined> {
  const isPornhub = url && url.includes("pornhub.com");
  if (!isPornhub && !userCookiesPath) return undefined;

  let content = "# Netscape HTTP Cookie File\n";

  if (userCookiesPath) {
    try {
      const userContent = await fs.readFile(userCookiesPath, "utf-8");
      content += userContent.replace("# Netscape HTTP Cookie File\n", "") + "\n";
    } catch (err) {
      console.warn(`[YtDlp] Failed to read user cookies at ${userCookiesPath}: ${err}`);
    }
  }

  if (isPornhub) {
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\tage_verified\t1\n";
  }

  const tempPath = path.join(os.tmpdir(), `ytdlp-cookies-${crypto.randomBytes(8).toString("hex")}.txt`);
  await fs.writeFile(tempPath, content);
  return tempPath;
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
    const info = JSON.parse(stdout) as YtDlpInfo;
    console.log(`[YtDlp] Successfully parsed JSON for ${info.id}. Title: "${info.title}"`);
    return info;
  } catch (err) {
    console.error(`[YtDlp] Failed to parse JSON. Error: ${err}`);
    console.error(`[YtDlp] Raw stdout snippet (first 500 chars): ${stdout.substring(0, 500)}`);
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
