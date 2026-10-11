import { Injectable, NotImplementedException } from "@nestjs/common";
import type { AnalyzeResponse } from "@video-downloader/types";


export abstract class MediaAnalyzer {
  abstract analyze(url: string, timeoutMs?: number, ageConsent?: boolean): Promise<AnalyzeResponse>;
}

/** Used only if no real analyzer is bound — kept for tests/local dev without yt-dlp installed. */
@Injectable()
export class StubMediaAnalyzer implements MediaAnalyzer {
  async analyze(_url: string, _timeoutMs?: number, _ageConsent?: boolean): Promise<AnalyzeResponse> {
    throw new NotImplementedException(
      "Media analysis isn't wired up in this environment (yt-dlp not available).",
    );
  }
}
