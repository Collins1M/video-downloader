import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base class for all user-facing app errors. Each carries a stable `code`
 * (matches ApiErrorResponse["code"] in @video-downloader/types) and a
 * friendly `message` safe to show directly in the UI — never a stack
 * trace, internal path, DB error, or ffmpeg log (Section 18).
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
  }
}

export class InvalidUrlException extends AppException {
  constructor() {
    super("INVALID_URL", "Please enter a valid video URL.", HttpStatus.BAD_REQUEST);
  }
}

export class UnsupportedSourceException extends AppException {
  constructor() {
    super(
      "UNSUPPORTED_SOURCE",
      "This video source isn't currently supported.",
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class VideoUnavailableException extends AppException {
  constructor() {
    super(
      "VIDEO_UNAVAILABLE",
      "We couldn't access this video. Check that the link is valid and publicly accessible.",
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ProcessingFailedException extends AppException {
  constructor() {
    super(
      "PROCESSING_FAILED",
      "Something went wrong while preparing your download. Please try again.",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class FileTooLargeException extends AppException {
  constructor() {
    super(
      "FILE_TOO_LARGE",
      "This video exceeds the maximum supported file size.",
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}

export class ProcessingTimeoutException extends AppException {
  constructor() {
    super(
      "TIMEOUT",
      "The video took too long to process. Please try another video or a lower quality.",
      HttpStatus.REQUEST_TIMEOUT,
    );
  }
}

export class RateLimitedException extends AppException {
  constructor() {
    super(
      "RATE_LIMITED",
      "You're making requests too quickly. Please wait a moment and try again.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class JobNotFoundException extends AppException {
  constructor() {
    super("VIDEO_UNAVAILABLE", "We couldn't find that download job.", HttpStatus.NOT_FOUND);
  }
}

export class JobNotReadyException extends AppException {
  constructor() {
    super("JOB_NOT_READY", "This download isn't ready yet. Please wait for processing to finish.", HttpStatus.CONFLICT);
  }
}

export class FileExpiredException extends AppException {
  constructor() {
    super(
      "FILE_EXPIRED",
      "This download has expired and was automatically removed. Please start a new download.",
      HttpStatus.GONE,
    );
  }
}
