import { describe, it, expect } from "vitest";
import {
  buildFormatOptions,
  resolveFormatTarget,
  containerForFormatId,
  outputFileName,
} from "./format-mapper";
import { FormatNotFoundError } from "./errors";
import type { YtDlpInfo } from "./yt-dlp";

const info: YtDlpInfo = {
  id: "abc123",
  title: "Test Video",
  duration: 272,
  formats: [
    { format_id: "18", ext: "mp4", height: 360, vcodec: "avc1.42001E", acodec: "mp4a.40.2", filesize: 9_000_000, tbr: 500 },
    { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1.640028", acodec: "none", filesize: 45_000_000, tbr: 4500 },
    { format_id: "247", ext: "webm", height: 720, vcodec: "vp9", acodec: "none", filesize: 20_000_000, tbr: 2000 },
    { format_id: "135", ext: "mp4", height: 480, vcodec: "avc1.4d401f", acodec: "none", filesize: 12_000_000, tbr: 1200 },
    { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a.40.2", filesize: 4_000_000, abr: 128 },
  ],
};

describe("buildFormatOptions", () => {
  const options = buildFormatOptions(info);

  it("includes an option for every available video height tier", () => {
    const heights = options.filter((o) => o.type === "video").map((o) => o.resolution);
    expect(heights).toEqual(expect.arrayContaining(["1080p", "720p", "480p", "360p"]));
  });

  it("only offers audio bitrate tiers the source can actually support", () => {
    // Source's only audio track is 128kbps — 320/192 tiers should be excluded.
    const audio = options.filter((o) => o.type === "audio");
    expect(audio.map((o) => o.bitrateKbps)).toEqual([128]);
  });

  it("estimates a combined size (video + paired audio) for video-only source tracks", () => {
    const opt1080 = options.find((o) => o.id === "1080p-mp4");
    expect(opt1080?.estimatedSize).toBeGreaterThan(45_000_000); // video alone is 45MB; should include audio too
  });

  it("does not pad size for an already-muxed format", () => {
    const opt360 = options.find((o) => o.id === "360p-mp4");
    expect(opt360?.estimatedSize).toBe(9_000_000); // 360p (format 18) already includes audio
  });

  it("skips a height tier the source doesn't offer", () => {
    const opt2160 = options.find((o) => o.id === "2160p-mp4");
    expect(opt2160).toBeUndefined();
  });

  it("returns no formats for a source with nothing usable", () => {
    const empty = buildFormatOptions({ ...info, formats: [] });
    expect(empty).toEqual([]);
  });
});

describe("resolveFormatTarget", () => {
  it("resolves a video-only tier to its video format plus the best paired audio", () => {
    const target = resolveFormatTarget(info, "1080p-mp4");
    expect(target).toEqual({
      kind: "video",
      container: "mp4",
      videoFormatId: "137",
      audioFormatId: "140",
    });
  });

  it("resolves an already-muxed tier with no separate audio needed", () => {
    const target = resolveFormatTarget(info, "360p-mp4");
    expect(target).toEqual({
      kind: "video",
      container: "mp4",
      videoFormatId: "18",
      audioFormatId: null,
    });
  });

  it("prefers avc1 (widely compatible) over vp9 at the same height when both exist", () => {
    const infoWithBothCodecsAt720: YtDlpInfo = {
      ...info,
      formats: [
        ...info.formats,
        { format_id: "999", ext: "mp4", height: 720, vcodec: "avc1.4d401f", acodec: "none", tbr: 1800 },
      ],
    };
    const target = resolveFormatTarget(infoWithBothCodecsAt720, "720p-mp4");
    expect(target.kind === "video" && target.videoFormatId).toBe("999");
  });

  it("resolves an audio tier to the best available audio track", () => {
    const target = resolveFormatTarget(info, "128kbps-mp3");
    expect(target).toEqual({
      kind: "audio",
      container: "mp3",
      audioFormatId: "140",
      bitrateKbps: 128,
    });
  });

  it("throws FormatNotFoundError for a height the source never offered", () => {
    expect(() => resolveFormatTarget(info, "2160p-mp4")).toThrow(FormatNotFoundError);
  });

  it("throws FormatNotFoundError for a malformed formatId", () => {
    expect(() => resolveFormatTarget(info, "not-a-real-format")).toThrow(FormatNotFoundError);
  });

  it("throws FormatNotFoundError for audio when the source has no audio track", () => {
    const noAudio: YtDlpInfo = { ...info, formats: info.formats.filter((f) => f.format_id !== "140") };
    expect(() => resolveFormatTarget(noAudio, "128kbps-mp3")).toThrow(FormatNotFoundError);
  });

  it("is deterministic across repeated calls (same input -> same output)", () => {
    const a = resolveFormatTarget(info, "1080p-mp4");
    const b = resolveFormatTarget(info, "1080p-mp4");
    expect(a).toEqual(b);
  });
});

describe("containerForFormatId / outputFileName", () => {
  it("infers mp4 for video tier ids", () => {
    expect(containerForFormatId("1080p-mp4")).toBe("mp4");
    expect(outputFileName("1080p-mp4")).toBe("output.mp4");
  });

  it("infers mp3 for audio tier ids", () => {
    expect(containerForFormatId("128kbps-mp3")).toBe("mp3");
    expect(outputFileName("128kbps-mp3")).toBe("output.mp3");
  });
});
