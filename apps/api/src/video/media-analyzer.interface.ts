import { Injectable, NotImplementedException } from "@nestjs/common";
import type { AnalyzeResponse } from "@video-downloader/types";

/**
 * Abstraction over "figure out what a URL is and what formats we can
 * offer for it." VideoService depends on this interface, not a concrete
 * implementation, so the real extractor (YtDlpMediaAnalyzer, Phase 6)
 * can be swapped in without touching the controller or route contracts.
 */
export abstract class MediaAnalyzer {
  abstract analyze(url: string): Promise<AnalyzeResponse>;
}

/** Used only if no real analyzer is bound — kept for tests/local dev without yt-dlp installed. */
@Injectable()
export class StubMediaAnalyzer implements MediaAnalyzer {
  async analyze(_url: string): Promise<AnalyzeResponse> {
    throw new NotImplementedException(
      "Media analysis isn't wired up in this environment (yt-dlp not available).",
    );
  }
}
