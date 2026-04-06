import { Module } from "@nestjs/common"
import { UploadController } from "./upload.controller"
import { UploadService } from "./upload.service"
import { ProjectModule } from "../project/project.module"

@Module({
  imports: [ProjectModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
