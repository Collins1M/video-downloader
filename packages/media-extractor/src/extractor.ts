import type { AnalyzeResponse, AnalyzedVideoItem, PlatformType, VideoInfo } from "@video-downloader/types";
import { fetchYtDlpInfo, type YtDlpInfo } from "./yt-dlp";
import { buildFormatOptions } from "./format-mapper";

export interface AnalyzeOptions {
  timeoutMs?: number;
  cookiesPath?: string;
  ageConsent?: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export function detectPlatform(url: string, extractorKey?: string): PlatformType {
  const lowerUrl = url.toLowerCase();
  const lowerKey = extractorKey?.toLowerCase() ?? "";

  if (lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am") || lowerKey.includes("instagram")) {
    return "instagram";
  }
  if (lowerUrl.includes("tiktok.com") || lowerKey.includes("tiktok")) {
    return "tiktok";
  }
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be") || lowerKey.includes("youtube")) {
    return "youtube";
  }
  if (lowerUrl.includes("pornhub.com") || lowerKey.includes("pornhub")) {
    return "pornhub";
  }
  return "generic";
}

export async function analyzeUrl(
  url: string,
  options: AnalyzeOptions = {},
): Promise<{ response: AnalyzeResponse; raw: YtDlpInfo }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  console.log(`[Extractor] Fetching raw info for ${url} (timeout: ${timeoutMs}ms, ageConsent: ${Boolean(options.ageConsent)})`);
  const info = await fetchYtDlpInfo(url, timeoutMs, options.cookiesPath, true, options.ageConsent);

  const mainSource = safeHostname(info.webpage_url) ?? safeHostname(url) ?? "unknown";
  const mainPlatform = detectPlatform(info.webpage_url ?? url, info.extractor_key);

  if (info.entries && Array.isArray(info.entries) && info.entries.length > 0) {
    console.log(`[Extractor] Multi-video/playlist detected. Processing ${info.entries.length} entries.`);

    const analyzedItems: AnalyzedVideoItem[] = info.entries.map((entry, index) => {
      const entrySource = safeHostname(entry.webpage_url) ?? mainSource;
      const entryPlatform = detectPlatform(entry.webpage_url ?? url, entry.extractor_key ?? info.extractor_key);
      const entryVideoInfo: VideoInfo = {
        title: entry.title || `Video ${index + 1}`,
        thumbnail: entry.thumbnail ?? info.thumbnail ?? "",
        duration: entry.duration ?? 0,
        source: entrySource,
        platform: entryPlatform,
      };

      return {
        id: entry.id || `${info.id || "playlist"}-${index + 1}`,
        url: entry.webpage_url || entry.url || url,
        video: entryVideoInfo,
        formats: buildFormatOptions(entry),
      };
    });

    const firstItem = analyzedItems[0];

    const response: AnalyzeResponse = {
      success: true,
      isPlaylist: true,
      playlistTitle: info.title ?? "Multi-Video Playlist",
      totalVideos: analyzedItems.length,
      video: firstItem.video,
      formats: firstItem.formats,
      videos: analyzedItems,
    };

    return { response, raw: info };
  }

  const rawFormatsCount = info.formats?.length ?? 0;
  console.log(`[Extractor] Raw info received: ${rawFormatsCount} raw formats found.`);
  console.log(`[Extractor] Detected Video: "${info.title}" | Duration: ${info.duration ?? 0}s`);

  const videoInfo: VideoInfo = {
    title: info.title,
    thumbnail: info.thumbnail ?? "",
    duration: info.duration ?? 0,
    source: mainSource,
    platform: mainPlatform,
  };

  const response: AnalyzeResponse = {
    success: true,
    video: videoInfo,
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
