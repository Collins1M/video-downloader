import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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

  constructor(private readonly config: ConfigService) {}

  async analyze(url: string, timeoutMs?: number): Promise<AnalyzeResponse> {
    this.logger.log(`Starting analysis for URL: ${url}`);
    try {
      const cookiesPath = this.config.get<string>("YT_DLP_COOKIES");
      const { response, raw } = await analyzeUrl(url, { timeoutMs, cookiesPath });
      this.logger.log(`Analysis successful: "${raw.title}" (${raw.duration ?? 0}s). Found ${response.formats.length} supported formats.`);
      return response;
    } catch (err) {
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
