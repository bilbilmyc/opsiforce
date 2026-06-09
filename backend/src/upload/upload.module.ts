import { Module } from "@nestjs/common"
import { UploadController } from "./upload.controller"
import { UploadService } from "./upload.service"
import { ProjectModule } from "../project/project.module"
import { ProjectEnvironmentModule } from "../project-environment/project-environment.module"

@Module({
  imports: [ProjectModule, ProjectEnvironmentModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
