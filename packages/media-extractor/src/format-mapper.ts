import type { FormatOption } from "@video-downloader/types";
import type { YtDlpFormat, YtDlpInfo } from "./yt-dlp";
import { FormatNotFoundError } from "./errors";

// Curated tiers we offer, regardless of how many raw formats yt-dlp
// reports. Keeping this a fixed, small set (rather than exposing every
// raw format) is what Section 6 shows in the UI mockup and keeps the
// formatId space small and predictable between analyze and download.
const VIDEO_HEIGHT_TIERS = [1080, 720, 480, 360];
const AUDIO_BITRATE_TIERS = [320, 192, 128];

export interface ResolvedVideoTarget {
  kind: "video";
  container: "mp4";
  /** yt-dlp format id to fetch for the video track. */
  videoFormatId: string;
  /** Set when the chosen video format has no embedded audio and a
   *  separate audio track must be fetched and muxed in. */
  audioFormatId: string | null;
}

export interface ResolvedAudioTarget {
  kind: "audio";
  container: "mp3";
  audioFormatId: string;
  bitrateKbps: number;
}

export type ResolvedTarget = ResolvedVideoTarget | ResolvedAudioTarget;

/** Container implied by our formatId naming convention (`-mp4` / `-mp3` suffix). */
export function containerForFormatId(formatId: string): "mp4" | "mp3" {
  return formatId.endsWith("-mp3") ? "mp3" : "mp4";
}

/** Deterministic output filename for a job, derivable by both the worker (writing it) and the API (streaming it) without any extra state. */
export function outputFileName(formatId: string): string {
  return `output.${containerForFormatId(formatId)}`;
}


function bestAudioFormat(formats: YtDlpFormat[]): YtDlpFormat | undefined {
  const audioOnly = formats.filter((f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"));
  if (audioOnly.length === 0) return undefined;
  return audioOnly.reduce((best, f) => ((f.abr ?? 0) > (best.abr ?? 0) ? f : best));
}

function bestVideoFormatForHeight(formats: YtDlpFormat[], height: number): YtDlpFormat | undefined {
  const candidates = formats.filter((f) => f.vcodec && f.vcodec !== "none" && f.height === height);
  if (candidates.length === 0) return undefined;
  // Prefer widely-compatible codecs, then higher bitrate.
  return candidates.reduce((best, f) => {
    const bestIsAvc = best.vcodec?.startsWith("avc1") ?? false;
    const fIsAvc = f.vcodec?.startsWith("avc1") ?? false;
    if (fIsAvc && !bestIsAvc) return f;
    if (!fIsAvc && bestIsAvc) return best;
    return (f.tbr ?? 0) > (best.tbr ?? 0) ? f : best;
  });
}

function estimateSize(f: YtDlpFormat, durationSeconds?: number): number | undefined {
  if (f.filesize) return f.filesize;
  if (f.filesize_approx) return f.filesize_approx;
  if (f.tbr && durationSeconds) return Math.round((f.tbr * 1000 * durationSeconds) / 8);
  return undefined;
}

/** Builds the curated FormatOption list shown to the user after analyze. */
export function buildFormatOptions(info: YtDlpInfo): FormatOption[] {
  const options: FormatOption[] = [];
  const audio = bestAudioFormat(info.formats);

  for (const height of VIDEO_HEIGHT_TIERS) {
    const video = bestVideoFormatForHeight(info.formats, height);
    if (!video) continue;

    const needsAudio = !video.acodec || video.acodec === "none";
    const combinedSize =
      estimateSize(video, info.duration) !== undefined
        ? (estimateSize(video, info.duration) ?? 0) +
          (needsAudio && audio ? (estimateSize(audio, info.duration) ?? 0) : 0)
        : undefined;

    options.push({
      id: `${height}p-mp4`,
      type: "video",
      container: "mp4",
      resolution: `${height}p`,
      estimatedSize: combinedSize,
    });
  }

  if (audio) {
    for (const bitrate of AUDIO_BITRATE_TIERS) {
      if ((audio.abr ?? 0) < bitrate * 0.75) continue; // don't offer a tier the source can't really support
      const estimated = info.duration ? Math.round((bitrate * 1000 * info.duration) / 8) : undefined;
      options.push({
        id: `${bitrate}kbps-mp3`,
        type: "audio",
        container: "mp3",
        bitrateKbps: bitrate,
        estimatedSize: estimated,
      });
    }
  }

  return options;
}

/**
 * Re-derives the same curated options against a fresh yt-dlp call and
 * finds the one matching `formatId`, returning the concrete yt-dlp
 * format id(s) needed to fetch it.
 *
 * Note: this assumes the source's available formats haven't materially
 * changed between analyze time and download time. For most sources that
 * holds over the minutes between a user analyzing and downloading; if it
 * doesn't, this throws FormatNotFoundError and the job fails cleanly
 * rather than silently fetching the wrong quality.
 */
export function resolveFormatTarget(info: YtDlpInfo, formatId: string): ResolvedTarget {
  const videoMatch = /^(\d+)p-mp4$/.exec(formatId);
  if (videoMatch) {
    const height = Number(videoMatch[1]);
    const video = bestVideoFormatForHeight(info.formats, height);
    if (!video) throw new FormatNotFoundError();

    const needsAudio = !video.acodec || video.acodec === "none";
    const audio = needsAudio ? bestAudioFormat(info.formats) : undefined;

    return {
      kind: "video",
      container: "mp4",
      videoFormatId: video.format_id,
      audioFormatId: needsAudio ? (audio?.format_id ?? null) : null,
    };
  }

  const audioMatch = /^(\d+)kbps-mp3$/.exec(formatId);
  if (audioMatch) {
    const audio = bestAudioFormat(info.formats);
    if (!audio) throw new FormatNotFoundError();

    return {
      kind: "audio",
      container: "mp3",
      audioFormatId: audio.format_id,
      bitrateKbps: Number(audioMatch[1]),
    };
  }

  throw new FormatNotFoundError();
}
