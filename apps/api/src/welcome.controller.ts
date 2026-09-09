import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: "API Welcome Message" })
  @ApiResponse({ status: 200, description: "Welcome to the Video Downloader API." })
  getWelcome() {
    return {
      message: "Video Downloader API is running.",
      docs: "/api-docs",
      status: "healthy",
    };
  }
}
