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
  AgeConsentRequiredError,
} from "./errors";

export interface RunYtDlpOptions {
  timeoutMs: number;
  maxBufferBytes?: number;
  cookiesPath?: string;
  ageConsent?: boolean;
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
  const finalArgs = [...STEALTH_ARGS];

  if (options.ageConsent) {
    finalArgs.push("--age-limit", "99");
  }

  // Instagram Web API stealth headers
  if (url && (url.includes("instagram.com") || url.includes("instagr.am"))) {
    finalArgs.push("--add-header", "X-IG-App-ID: 936619743392459");
    finalArgs.push("--add-header", "X-ASBD-ID: 198387");
    finalArgs.push("--add-header", "X-IG-WWW-Claim: 0");
  }

  finalArgs.push(...args);

  // Use the URL (usually the last arg) as the referer to bypass some 403 blocks
  if (url?.startsWith("http")) {
    finalArgs.unshift("--referer", url);
  }

  const tempCookiesPath = await ensureCookieFile(url, options.cookiesPath, options.ageConsent);
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

          // If ageConsent was NOT passed yet, signal to prompt for age consent first
          if (!options.ageConsent) {
            if (
              lowerStderr.includes("sign in to confirm your age") ||
              lowerStderr.includes("confirm your age") ||
              lowerStderr.includes("age-restricted") ||
              lowerStderr.includes("can't be seen by certain audiences") ||
              lowerStderr.includes("isn't available to everyone")
            ) {
              reject(new AgeConsentRequiredError(stderr));
              return;
            }
          }

          // If ageConsent WAS passed and content is still restricted to logged-in/private audiences,
          // then Instagram/platform strictly requires a logged-in account.
          if (
            lowerStderr.includes("you need to log in") ||
            lowerStderr.includes("use --cookies") ||
            lowerStderr.includes("isn't available to everyone") ||
            lowerStderr.includes("can't be seen by certain audiences")
          ) {
            reject(new AuthenticationRequiredError(stderr));
            return;
          }

          if (
            lowerStderr.includes("video unavailable") ||
            lowerStderr.includes("private video") ||
            lowerStderr.includes("this video is unavailable") ||
            lowerStderr.includes("content isn't available") ||
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

async function ensureCookieFile(url: string, userCookiesPath?: string, ageConsent?: boolean): Promise<string | undefined> {
  const isPornhub = url && url.includes("pornhub.com");
  if (!isPornhub && !userCookiesPath && !ageConsent) return undefined;

  let content = "# Netscape HTTP Cookie File\n";

  if (userCookiesPath) {
    try {
      const userContent = await fs.readFile(userCookiesPath, "utf-8");
      content += userContent.replace("# Netscape HTTP Cookie File\n", "") + "\n";
    } catch (err) {
      console.warn(`[YtDlp] Failed to read user cookies at ${userCookiesPath}: ${err}`);
    }
  }

  if (isPornhub || ageConsent) {
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\tage_verified\t1\n";
    content += ".youtube.com\tTRUE\t/\tFALSE\t2147483647\tST-1393685324\t1\n";
  }

  const tempPath = path.join(os.tmpdir(), `ytdlp-cookies-${crypto.randomBytes(8).toString("hex")}.txt`);
  await fs.writeFile(tempPath, content);
  return tempPath;
}

export async function fetchYtDlpInfo(
  url: string,
  timeoutMs: number,
  cookiesPath?: string,
  allowPlaylist: boolean = true,
  ageConsent: boolean = false,
): Promise<YtDlpInfo> {
  const args = ["--dump-single-json", "--no-warnings", "--no-check-certificates"];
  if (!allowPlaylist) {
    args.push("--no-playlist");
  }

  args.push("--", url);

  try {
    const stdout = await runYtDlp(args, { timeoutMs, cookiesPath, ageConsent });
    const info = JSON.parse(stdout) as YtDlpInfo;
    console.log(`[YtDlp] Successfully parsed JSON for ${info.id || info.title}. Type: ${info._type ?? 'single'}`);
    return info;
  } catch (err) {
    // Try Instagram embed fallback if standard extraction fails
    const instagramMatch = /instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i.exec(url);
    if (instagramMatch) {
      const shortcode = instagramMatch[1];
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      console.log(`[YtDlp] Attempting Instagram embed fallback for shortcode ${shortcode}: ${embedUrl}`);
      try {
        const fallbackArgs = ["--dump-single-json", "--no-warnings", "--no-check-certificates", "--", embedUrl];
        const stdout = await runYtDlp(fallbackArgs, { timeoutMs, cookiesPath, ageConsent });
        const info = JSON.parse(stdout) as YtDlpInfo;
        console.log(`[YtDlp] Embed fallback successful for ${info.id || info.title}`);
        return info;
      } catch (fallbackErr) {
        console.warn(`[YtDlp] Embed fallback failed: ${fallbackErr}`);
      }
    }
    throw err;
  }
}


export async function fetchYtDlpFormat(
  url: string,
  ytDlpFormatId: string,
  outputPath: string,
  timeoutMs: number,
  cookiesPath?: string,
  ageConsent?: boolean,
): Promise<void> {
  const formatSpec =
    ytDlpFormatId.includes("/") || ytDlpFormatId === "best" || ytDlpFormatId === "b"
      ? ytDlpFormatId
      : `${ytDlpFormatId}/best`;

  await runYtDlp(
    [
      "-f",
      formatSpec,
      "-o",
      outputPath,
      "--no-progress",
      "--no-warnings",
      "--no-playlist",
      "--no-check-certificates",
      "--no-part",
      "--retries",
      "10",
      "--fragment-retries",
      "10",
      "--concurrent-fragments",
      "5",
      "--",
      url,
    ],
    { timeoutMs, cookiesPath, ageConsent },
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
  url?: string;
  extractor_key?: string;
  extractor?: string;
  uploader?: string;
  _type?: string;
  entries?: YtDlpInfo[];
  formats?: YtDlpFormat[];
  age_limit?: number;
}
