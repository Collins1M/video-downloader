import type { FormatOption } from "@video-downloader/types";
import type { YtDlpFormat, YtDlpInfo } from "./yt-dlp";
import { FormatNotFoundError } from "./errors";


const VIDEO_HEIGHT_TIERS = [2160, 1080, 720, 480, 360, 240, 144];
const AUDIO_BITRATE_TIERS = [320, 192, 128];

export interface ResolvedVideoTarget {
  kind: "video";
  container: "mp4";
  videoFormatId: string;
  audioFormatId: string | null;
}

export interface ResolvedAudioTarget {
  kind: "audio";
  container: "mp3";
  audioFormatId: string;
  bitrateKbps: number;
}

export interface ResolvedGifTarget {
  kind: "gif";
  container: "gif";
  videoFormatId: string;
}

export type ResolvedTarget = ResolvedVideoTarget | ResolvedAudioTarget | ResolvedGifTarget;

export function containerForFormatId(formatId: string): "mp4" | "mp3" | "gif" {
  if (formatId.endsWith("-mp3")) return "mp3";
  if (formatId.endsWith("-gif")) return "gif";
  return "mp4";
}

export function outputFileName(formatId: string): string {
  return `output.${containerForFormatId(formatId)}`;
}


function bestAudioFormat(formats: YtDlpFormat[]): YtDlpFormat | undefined {
  const audioOnly = formats.filter((f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"));
  if (audioOnly.length === 0) return undefined;
  return audioOnly.reduce((best, f) => ((f.abr ?? 0) > (best.abr ?? 0) ? f : best));
}

function bestVideoFormatForHeight(formats: YtDlpFormat[], height: number): YtDlpFormat | undefined {
  const candidates = formats.filter((f) => {
    if (!f.vcodec || f.vcodec === "none" || f.vcodec === "gif") return false;
    const actualHeight = f.height ?? 0;
    const actualWidth = (f as any).width ?? 0;
    return actualHeight === height || actualWidth === height;
  });

  if (candidates.length === 0) return undefined;
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

export function buildFormatOptions(info: YtDlpInfo): FormatOption[] {
  console.log(`[FormatMapper] Curating formats for: ${info.title}`);
  const options: FormatOption[] = [];
  const audio = bestAudioFormat(info.formats);

  for (const height of VIDEO_HEIGHT_TIERS) {
    const video = bestVideoFormatForHeight(info.formats, height);
    if (!video) {
      console.log(`[FormatMapper] No source match for ${height}p`);
      continue;
    }

    console.log(`[FormatMapper] Matched ${height}p using source format ${video.format_id}`);
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

  if (!info.duration || info.duration <= 60) {
    const video480 =
      bestVideoFormatForHeight(info.formats, 480) ||
      bestVideoFormatForHeight(info.formats, 360) ||
      info.formats.find((f) => f.vcodec !== "none");

    if (video480) {
      options.push({
        id: `${video480.height ?? 480}p-gif`,
        type: "gif",
        container: "gif",
        resolution: `${video480.height ?? 480}p`,
      });
    }
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

  const gifMatch = /^(\d+)p-gif$/.exec(formatId);
  if (gifMatch) {
    const height = Number(gifMatch[1]);
    const video = bestVideoFormatForHeight(info.formats, height);
    if (!video) throw new FormatNotFoundError();
    return {
      kind: "gif",
      container: "gif",
      videoFormatId: video.format_id,
    };
  }

  throw new FormatNotFoundError();
}
