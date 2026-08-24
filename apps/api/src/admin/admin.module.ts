import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VIDEO_PROCESSING_QUEUE } from "@video-downloader/types";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminBasicAuthGuard } from "./basic-auth.guard";

@Module({
  imports: [BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })],
  controllers: [AdminController],
  providers: [AdminService, AdminBasicAuthGuard],
})
export class AdminModule {}
