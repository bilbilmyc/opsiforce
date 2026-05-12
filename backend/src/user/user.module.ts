import { forwardRef, Global, Module } from "@nestjs/common"
import { UserController } from "./user.controller"
import { UserService } from "./user.service"
import { WorkspaceModule } from "../workspace/workspace.module"

@Global()
@Module({
  imports: [forwardRef(() => WorkspaceModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
