import { execFile, spawn } from "node:child_process";
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

export function sanitizeUrl(inputUrl: string): string {
  const match = /https?:\/\/[^\s]+/i.exec(inputUrl.trim());
  return match ? match[0] : inputUrl.trim();
}

export async function runYtDlp(args: string[], options: RunYtDlpOptions): Promise<string> {
  const rawUrl = args[args.length - 1];
  const url = sanitizeUrl(rawUrl);
  args[args.length - 1] = url;
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

  if (url && url.includes("pornhub")) {
    finalArgs.push("--add-header", "Cookie: age_verified=1; accessType=1; hasVisited=1");
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
              lowerStderr.includes("isn't available to everyone") ||
              lowerStderr.includes("redirection detected") ||
              lowerStderr.includes("require login")
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
            lowerStderr.includes("can't be seen by certain audiences") ||
            lowerStderr.includes("redirection detected")
          ) {
            reject(new AuthenticationRequiredError(stderr));
            return;
          }

          if (
            lowerStderr.includes("video unavailable") ||
            lowerStderr.includes("private video") ||
            lowerStderr.includes("this video is unavailable") ||
            lowerStderr.includes("content isn't available") ||
            lowerStderr.includes("model is in a private show") ||
            lowerStderr.includes("room is currently offline") ||
            lowerStderr.includes("no video could be found in this tweet")
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
  const isPornhub = url && url.includes("pornhub");
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
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\taccessType\t1\n";
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\thasVisited\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\tage_verified\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\taccessType\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\thasVisited\t1\n";
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
    let info: YtDlpInfo;
    try {
      info = JSON.parse(stdout) as YtDlpInfo;
    } catch (err) {
      throw new ExtractionFailedError("yt-dlp returned non-JSON output");
    }
    console.log(`[YtDlp] Successfully parsed JSON for ${info.id || info.title}. Type: ${info._type ?? 'single'}`);
    return info;
  } catch (err) {
    const twitterMatch = /(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/([0-9]+)/i.exec(url);
    if (twitterMatch) {
      console.log(`[YtDlp] Attempting Twitter/X image post extraction for ${url}...`);
      const imgInfo = await fetchTwitterImagePost(url);
      if (imgInfo) {
        console.log(`[YtDlp] Twitter image extraction successful for ${imgInfo.id}`);
        return imgInfo;
      }
    }

    // If standard extraction failed or returned "there is no video in this post", try Instagram image extraction
    const instagramMatch = /instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i.exec(url);
    if (instagramMatch) {
      console.log(`[YtDlp] Attempting Instagram image post extraction for ${url}...`);
      const imgInfo = await fetchInstagramImagePost(url);
      if (imgInfo) {
        console.log(`[YtDlp] Instagram image extraction successful for ${imgInfo.id}`);
        return imgInfo;
      }

      const shortcode = instagramMatch[1];
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      console.log(`[YtDlp] Attempting Instagram embed fallback for shortcode ${shortcode}: ${embedUrl}`);
      try {
        const fallbackArgs = ["--dump-single-json", "--no-warnings", "--no-check-certificates", "--", embedUrl];
        const stdout = await runYtDlp(fallbackArgs, { timeoutMs, cookiesPath, ageConsent });
        let info: YtDlpInfo;
        try {
          info = JSON.parse(stdout) as YtDlpInfo;
        } catch (fallbackErr) {
          throw new ExtractionFailedError("yt-dlp returned non-JSON output");
        }
        console.log(`[YtDlp] Embed fallback successful for ${info.id || info.title}`);
        return info;
      } catch (fallbackErr) {
        console.warn(`[YtDlp] Embed fallback failed: ${fallbackErr}`);
      }
    }
    throw err;
  }
}

export async function fetchInstagramImagePost(url: string): Promise<YtDlpInfo | null> {
  const match = /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i.exec(url);
  if (!match) return null;

  const shortcode = match[1];
  const postUrl = `https://www.instagram.com/p/${shortcode}/`;

  const userAgents = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(postUrl, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      const imageUrls: string[] = [];

      const ogImageRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
      let matchOg;
      while ((matchOg = ogImageRegex.exec(html)) !== null) {
        const img = matchOg[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
        if (img && !imageUrls.includes(img)) {
          imageUrls.push(img);
        }
      }

      const ogImageRegexRev = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi;
      while ((matchOg = ogImageRegexRev.exec(html)) !== null) {
        const img = matchOg[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
        if (img && !imageUrls.includes(img)) {
          imageUrls.push(img);
        }
      }

      if (imageUrls.length === 0) {
        const twitterImageRegex = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi;
        while ((matchOg = twitterImageRegex.exec(html)) !== null) {
          const img = matchOg[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
          if (img && !imageUrls.includes(img)) {
            imageUrls.push(img);
          }
        }
      }

      const jsonImageMatches = [...html.matchAll(/"(?:display_url|url)"\s*:\s*"(https:\/\/[^"]+?cdninstagram\.com\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)];
      for (const m of jsonImageMatches) {
        let clean = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "").replace(/&amp;/g, "&");
        if (clean && !imageUrls.includes(clean) && !clean.includes("profile_pic") && !clean.includes("150x150")) {
          imageUrls.push(clean);
        }
      }

      if (imageUrls.length === 0) continue;

      const fullSizeImageUrls = imageUrls.map(getFullSizeInstagramImageUrl);

      let title = "Instagram Photo";
      const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
      if (ogTitleMatch) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      }

      console.log(`[InstagramImageExtractor] Extracted ${fullSizeImageUrls.length} unique carousel image(s) for ${shortcode}`);

      if (fullSizeImageUrls.length > 1) {
        const entries: YtDlpInfo[] = fullSizeImageUrls.map((imgUrl, index) => ({
          id: `${shortcode}-${index + 1}`,
          title: `${title} (Slide ${index + 1}/${fullSizeImageUrls.length})`,
          thumbnail: imgUrl,
          duration: 0,
          webpage_url: postUrl,
          url: imgUrl,
          extractor_key: "Instagram",
          extractor: "instagram",
          formats: [
            {
              format_id: `image-${index + 1}`,
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        }));

        return {
          id: shortcode,
          title,
          thumbnail: fullSizeImageUrls[0],
          duration: 0,
          webpage_url: postUrl,
          url: fullSizeImageUrls[0],
          extractor_key: "Instagram",
          extractor: "instagram",
          _type: "playlist",
          entries,
          formats: [
            {
              format_id: "image-1",
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        };
      }

      const imageUrl = fullSizeImageUrls[0];
      return {
        id: shortcode,
        title,
        thumbnail: imageUrl,
        duration: 0,
        webpage_url: postUrl,
        url: imageUrl,
        extractor_key: "Instagram",
        extractor: "instagram",
        formats: [
          {
            format_id: "image",
            ext: "jpg",
            height: 1080,
            vcodec: "none",
            acodec: "none",
            protocol: "https",
          },
        ],
      };
    } catch (err) {
      console.warn(`[InstagramImageExtractor] Failed with UA ${ua}: ${err}`);
    }
  }

  return null;
}

export async function fetchTwitterImagePost(url: string): Promise<YtDlpInfo | null> {
  const match = /(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/([0-9]+)/i.exec(url);
  if (!match) return null;

  const tweetId = match[1];

  const userAgents = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const imageUrls: string[] = [];

      const ogImageRegex = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
      let matchOg;
      while ((matchOg = ogImageRegex.exec(html)) !== null) {
        const img = matchOg[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
        if (img && !imageUrls.includes(img) && !img.includes("profile_images")) {
          imageUrls.push(img);
        }
      }

      const twitterImageRegex = /<meta[^>]+name=["']twitter:image(?:[0-9])?["'][^>]+content=["']([^"']+)["']/gi;
      while ((matchOg = twitterImageRegex.exec(html)) !== null) {
        const img = matchOg[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
        if (img && !imageUrls.includes(img) && !img.includes("profile_images")) {
          imageUrls.push(img);
        }
      }

      if (imageUrls.length === 0) continue;

      let title = "X (Twitter) Photo";
      const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
      if (ogTitleMatch) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      }

      const fullSizeImageUrls = imageUrls.map(getFullSizeInstagramImageUrl);

      if (fullSizeImageUrls.length > 1) {
        const entries: YtDlpInfo[] = fullSizeImageUrls.map((imgUrl, index) => ({
          id: `${tweetId}-${index + 1}`,
          title: `${title} (Slide ${index + 1}/${fullSizeImageUrls.length})`,
          thumbnail: imgUrl,
          duration: 0,
          webpage_url: url,
          url: imgUrl,
          extractor_key: "Twitter",
          extractor: "twitter",
          formats: [
            {
              format_id: `image-${index + 1}`,
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        }));

        return {
          id: tweetId,
          title,
          thumbnail: fullSizeImageUrls[0],
          duration: 0,
          webpage_url: url,
          url: fullSizeImageUrls[0],
          extractor_key: "Twitter",
          extractor: "twitter",
          _type: "playlist",
          entries,
          formats: [
            {
              format_id: "image-1",
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        };
      }

      const imageUrl = fullSizeImageUrls[0];
      return {
        id: tweetId,
        title,
        thumbnail: imageUrl,
        duration: 0,
        webpage_url: url,
        url: imageUrl,
        extractor_key: "Twitter",
        extractor: "twitter",
        formats: [
          {
            format_id: "image",
            ext: "jpg",
            height: 1080,
            vcodec: "none",
            acodec: "none",
            protocol: "https",
          },
        ],
      };
    } catch (err) {
      console.warn(`[TwitterImageExtractor] Failed with UA ${ua}: ${err}`);
    }
  }

  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .trim();
}

function getFullSizeInstagramImageUrl(url: string): string {
  return url;
}


export async function runYtDlpWithProgress(
  args: string[],
  options: RunYtDlpOptions,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const url = args[args.length - 1];
  const finalArgs = [...STEALTH_ARGS];

  if (options.ageConsent) {
    finalArgs.push("--age-limit", "99");
  }

  if (url && (url.includes("instagram.com") || url.includes("instagr.am"))) {
    finalArgs.push("--add-header", "X-IG-App-ID: 936619743392459");
    finalArgs.push("--add-header", "X-ASBD-ID: 198387");
    finalArgs.push("--add-header", "X-IG-WWW-Claim: 0");
  }

  finalArgs.push(...args);

  if (url?.startsWith("http")) {
    finalArgs.unshift("--referer", url);
  }

  const tempCookiesPath = await ensureCookieFile(url, options.cookiesPath, options.ageConsent);
  if (tempCookiesPath) {
    finalArgs.unshift("--cookies", tempCookiesPath);
  }

  const startTime = Date.now();
  console.log(`[YtDlp] Executing with progress: yt-dlp ${finalArgs.join(" ")}`);

  try {
    return await new Promise<string>((resolvePromise, reject) => {
      const child = spawn("yt-dlp", finalArgs, {
        timeout: options.timeoutMs,
      });

      let stdoutData = "";
      let stderrData = "";

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        stdoutData += text;

        if (onProgress) {
          const lines = text.split(/[\r\n]+/);
          for (const line of lines) {
            const match = /\[download\]\s+([\d.]+)/i.exec(line);
            if (match) {
              const parsed = parseFloat(match[1]);
              if (!isNaN(parsed)) {
                onProgress(parsed);
              }
            }
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString("utf-8");
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new ExtractionFailedError(err.message));
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        console.log(`[YtDlp] Finished in ${duration}ms (code ${code})`);

        if (code === 0) {
          resolvePromise(stdoutData);
          return;
        }

        console.error(`[YtDlp] Command failed after ${duration}ms:`, stderrData);

        if (timedOut || signal === "SIGTERM") {
          reject(new ExtractionTimeoutError(stderrData));
          return;
        }

        const lowerStderr = stderrData.toLowerCase();
        if (lowerStderr.includes("unsupported url")) {
          reject(new UnsupportedSourceError(stderrData));
          return;
        }

        if (!options.ageConsent) {
          if (
            lowerStderr.includes("sign in to confirm your age") ||
            lowerStderr.includes("confirm your age") ||
            lowerStderr.includes("age-restricted") ||
            lowerStderr.includes("can't be seen by certain audiences") ||
            lowerStderr.includes("isn't available to everyone") ||
            lowerStderr.includes("redirection detected") ||
            lowerStderr.includes("require login")
          ) {
            reject(new AgeConsentRequiredError(stderrData));
            return;
          }
        }

        if (
          lowerStderr.includes("you need to log in") ||
          lowerStderr.includes("use --cookies") ||
          lowerStderr.includes("isn't available to everyone") ||
          lowerStderr.includes("can't be seen by certain audiences")
        ) {
          reject(new AuthenticationRequiredError(stderrData));
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
          reject(new VideoUnavailableError(stderrData));
          return;
        }

        reject(new ExtractionFailedError(stderrData));
      });
    });
  } finally {
    if (tempCookiesPath) {
      await fs.unlink(tempCookiesPath).catch((err) => {
        console.warn(`[YtDlp] Failed to delete temp cookies file ${tempCookiesPath}: ${err}`);
      });
    }
  }
}

export async function fetchYtDlpFormat(
  url: string,
  ytDlpFormatId: string,
  outputPath: string,
  timeoutMs: number,
  cookiesPath?: string,
  ageConsent?: boolean,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const formatSpec =
    ytDlpFormatId.includes("/") || ytDlpFormatId === "best" || ytDlpFormatId === "b"
      ? ytDlpFormatId
      : `${ytDlpFormatId}/best`;

  const args = [
    "-f",
    formatSpec,
    "-o",
    outputPath,
    "--newline",
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
  ];

  if (onProgress) {
    await runYtDlpWithProgress(args, { timeoutMs, cookiesPath, ageConsent }, onProgress);
  } else {
    args.unshift("--no-progress");
    await runYtDlp(args, { timeoutMs, cookiesPath, ageConsent });
  }
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
