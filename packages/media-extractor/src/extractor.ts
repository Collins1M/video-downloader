import type { AnalyzeResponse } from "@video-downloader/types";
import { fetchYtDlpInfo, type YtDlpInfo } from "./yt-dlp";
import { buildFormatOptions } from "./format-mapper";

export interface AnalyzeOptions {
  timeoutMs?: number;
  cookiesPath?: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Runs yt-dlp for `url` and returns both the curated AnalyzeResponse and the raw info (the worker needs the raw info again to resolve a chosen format). */
export async function analyzeUrl(
  url: string,
  options: AnalyzeOptions = {},
): Promise<{ response: AnalyzeResponse; raw: YtDlpInfo }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  console.log(`[Extractor] Fetching raw info for ${url} (timeout: ${timeoutMs}ms)`);
  const info = await fetchYtDlpInfo(url, timeoutMs, options.cookiesPath);

  console.log(`[Extractor] Raw info received: ${info.formats.length} raw formats found.`);
  const source = safeHostname(info.webpage_url) ?? safeHostname(url) ?? "unknown";

  const response: AnalyzeResponse = {
    success: true,
    video: {
      title: info.title,
      thumbnail: info.thumbnail ?? "",
      duration: info.duration ?? 0,
      source,
    },
    formats: buildFormatOptions(info),
  };

  return { response, raw: info };
}

function safeHostname(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
