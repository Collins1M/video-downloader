import ffmpeg from "fluent-ffmpeg";

export type ProgressCallback = (percent: number) => void;

/**
 * Merges a separately-fetched video track and audio track into one MP4.
 * `-c:v copy` avoids re-encoding the video (Section 12: prefer remux
 * over expensive re-encoding); audio is transcoded to AAC since that's
 * what MP4/Section 12's default output expects and source audio codecs
 * vary. `+faststart` moves the moov atom to the front so the file is
 * streamable/seekable immediately rather than only after a full download.
 */
export function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  durationSeconds: number | undefined,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const command = ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-movflags +faststart"])
      .output(outputPath);

    attachProgress(command, durationSeconds, onProgress);

    command.on("end", () => resolvePromise()).on("error", (err) => reject(err));
    command.run();
  });
}

/** Single already-muxed source: remux into a clean MP4 without re-encoding. */
export function remuxToMp4(
  inputPath: string,
  outputPath: string,
  durationSeconds: number | undefined,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const command = ffmpeg()
      .input(inputPath)
      .outputOptions(["-c copy", "-movflags +faststart"])
      .output(outputPath);

    attachProgress(command, durationSeconds, onProgress);

    command.on("end", () => resolvePromise()).on("error", (err) => reject(err));
    command.run();
  });
}

/** Audio-only request: extract/transcode to MP3 at the requested bitrate. */
export function extractAudioToMp3(
  inputPath: string,
  outputPath: string,
  bitrateKbps: number,
  durationSeconds: number | undefined,
  onProgress?: ProgressCallback,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const command = ffmpeg()
      .input(inputPath)
      .outputOptions(["-vn", `-b:a ${bitrateKbps}k`])
      .output(outputPath);

    attachProgress(command, durationSeconds, onProgress);

    command.on("end", () => resolvePromise()).on("error", (err) => reject(err));
    command.run();
  });
}

function attachProgress(
  command: ffmpeg.FfmpegCommand,
  durationSeconds: number | undefined,
  onProgress?: ProgressCallback,
) {
  if (!onProgress) return;
  command.on("progress", (progress) => {
    if (durationSeconds && progress.timemark) {
      const elapsed = timemarkToSeconds(progress.timemark);
      const percent = Math.min(99, Math.round((elapsed / durationSeconds) * 100));
      onProgress(percent);
    } else if (typeof progress.percent === "number") {
      onProgress(Math.min(99, Math.round(progress.percent)));
    }
  });
}

function timemarkToSeconds(timemark: string): number {
  const parts = timemark.split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}
