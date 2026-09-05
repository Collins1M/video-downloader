import { Injectable, Logger } from "@nestjs/common";
import type { AnalyzeResponse } from "@video-downloader/types";
import {
  analyzeUrl,
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
} from "@video-downloader/media-extractor";
import { MediaAnalyzer } from "./media-analyzer.interface";
import {
  UnsupportedSourceException,
  VideoUnavailableException,
  ProcessingTimeoutException,
  ProcessingFailedException,
} from "../common/exceptions/app-exceptions";

@Injectable()
export class YtDlpMediaAnalyzer implements MediaAnalyzer {
  private readonly logger = new Logger("YtDlpMediaAnalyzer");

  async analyze(url: string, timeoutMs?: number): Promise<AnalyzeResponse> {
    try {
      const { response } = await analyzeUrl(url, { timeoutMs });
      return response;
    } catch (err) {
      // Log the real detail server-side; the client only ever gets the
      // pre-written friendly message on each error class (Section 18).
      this.logger.warn(
        `analyze failed: ${err instanceof Error ? err.message : String(err)}` +
          ((err as { detail?: string })?.detail ? ` — ${(err as { detail?: string }).detail}` : ""),
      );

      if (err instanceof UnsupportedSourceError) throw new UnsupportedSourceException();
      if (err instanceof VideoUnavailableError) throw new VideoUnavailableException();
      if (err instanceof ExtractionTimeoutError) throw new ProcessingTimeoutException();
      if (err instanceof ExtractionFailedError) throw new ProcessingFailedException();
      throw new ProcessingFailedException();
    }
  }
}
