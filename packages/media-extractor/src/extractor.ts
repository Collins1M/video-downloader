import type { AnalyzeResponse } from "@video-downloader/types";
import { fetchYtDlpInfo, type YtDlpInfo } from "./yt-dlp";
import { buildFormatOptions } from "./format-mapper";

export interface AnalyzeOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** Runs yt-dlp for `url` and returns both the curated AnalyzeResponse and the raw info (the worker needs the raw info again to resolve a chosen format). */
export async function analyzeUrl(
  url: string,
  options: AnalyzeOptions = {},
): Promise<{ response: AnalyzeResponse; raw: YtDlpInfo }> {
  const info = await fetchYtDlpInfo(url, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
