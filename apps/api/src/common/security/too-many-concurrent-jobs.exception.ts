import { AppException } from "../exceptions/app-exceptions";
import { HttpStatus } from "@nestjs/common";

export class TooManyConcurrentJobsException extends AppException {
  constructor() {
    super(
      "RATE_LIMITED",
      "You have too many downloads in progress. Please wait for one to finish before starting another.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
