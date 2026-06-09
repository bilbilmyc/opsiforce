import { Controller, Get } from "@nestjs/common"
import { ProjectService } from "./project.service"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"

@Controller("pod-classes")
export class PodClassController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @RequirePermission(Perms.manageProjectPodSettings)
  getCatalog() {
    return this.projectService.getPodClassCatalog()
  }
}
