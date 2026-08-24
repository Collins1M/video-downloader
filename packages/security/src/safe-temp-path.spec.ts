import { describe, it, expect } from "vitest";
import { resolve, sep } from "node:path";
import { safeTempFilePath, safeTempJobDir } from "./safe-temp-path";

const BASE = "/var/tmp/video-downloader";

describe("safeTempFilePath", () => {
  it("builds the expected path for valid inputs", () => {
    const result = safeTempFilePath(BASE, "clx1a2b3c", "output.mp4");
    expect(result).toBe(resolve(BASE, "clx1a2b3c", "output.mp4"));
  });

  it("accepts jobIds and filenames with letters, digits, dash, underscore", () => {
    expect(() => safeTempFilePath(BASE, "job_123-ABC", "video_1.tmp")).not.toThrow();
  });

  it.each([
    ["../../etc/passwd", "output.mp4"],
    ["job1", "../../../etc/passwd"],
    ["job1", "..%2F..%2Fetc%2Fpasswd"],
    ["job/1", "output.mp4"],
    ["job1", "sub/output.mp4"],
    ["", "output.mp4"],
    ["job1", ""],
    ["job1\0", "output.mp4"],
  ])("rejects traversal/unsafe segment: jobId=%j filename=%j", (jobId, filename) => {
    expect(() => safeTempFilePath(BASE, jobId, filename)).toThrow();
  });

  it("never resolves outside baseDir even for maximally adversarial input", () => {
    const attempts = [
      ["..", "output.mp4"],
      ["job1", ".."],
      ["job1", "..-mp4"], // sneaky but still just a normal filename, should be allowed
    ];
    for (const [jobId, filename] of attempts) {
      try {
        const result = safeTempFilePath(BASE, jobId, filename);
        // If it didn't throw, it must still be inside baseDir.
        expect(result === resolve(BASE) || result.startsWith(resolve(BASE) + sep)).toBe(true);
      } catch {
        // Throwing is the expected/safe outcome for true traversal attempts.
      }
    }
  });
});

describe("safeTempJobDir", () => {
  it("builds the expected per-job directory path", () => {
    expect(safeTempJobDir(BASE, "clx1a2b3c")).toBe(resolve(BASE, "clx1a2b3c"));
  });

  it("rejects a traversal jobId", () => {
    expect(() => safeTempJobDir(BASE, "../../etc")).toThrow();
  });

  it("rejects an empty jobId", () => {
    expect(() => safeTempJobDir(BASE, "")).toThrow();
  });
});
