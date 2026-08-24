import { Injectable } from "@nestjs/common";
import { validateUrl, UnsafeUrlError } from "@video-downloader/security";
import { InvalidUrlException } from "../exceptions/app-exceptions";

@Injectable()
export class UrlValidatorService {
  async validate(rawUrl: string): Promise<URL> {
    try {
      return await validateUrl(rawUrl);
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        throw new InvalidUrlException();
      }
      throw err;
    }
  }
}
