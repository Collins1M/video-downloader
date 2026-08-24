export class UnsupportedSourceError extends Error {
  detail?: string;
  constructor(detail?: string) {
    super("This video source isn't currently supported.");
    this.name = "UnsupportedSourceError";
    this.detail = detail;
  }
}

export class VideoUnavailableError extends Error {
  detail?: string;
  constructor(detail?: string) {
    super("We couldn't access this video. Check that the link is valid and publicly accessible.");
    this.name = "VideoUnavailableError";
    this.detail = detail;
  }
}

export class ExtractionTimeoutError extends Error {
  detail?: string;
  constructor(detail?: string) {
    super("The video took too long to process. Please try another video or a lower quality.");
    this.name = "ExtractionTimeoutError";
    this.detail = detail;
  }
}

export class ExtractionFailedError extends Error {
  detail?: string;
  constructor(detail?: string) {
    super("Something went wrong while preparing your download. Please try again.");
    this.name = "ExtractionFailedError";
    this.detail = detail;
  }
}

export class FormatNotFoundError extends Error {
  constructor() {
    super("The requested format is no longer available for this video.");
    this.name = "FormatNotFoundError";
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("This video exceeds the maximum supported file size.");
    this.name = "FileTooLargeError";
  }
}
