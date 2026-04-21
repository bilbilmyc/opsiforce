import { Module } from "@nestjs/common"
import { WorkspaceController } from "./workspace.controller"
import { WorkspaceService } from "./workspace.service"
import { ProjectModule } from "../project/project.module"

@Module({
  imports: [ProjectModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
