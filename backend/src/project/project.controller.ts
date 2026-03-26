import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from "@nestjs/common"
import { ProjectService } from "./project.service"
import { CreateProjectDto, UpdateProjectDto } from "./project.types"

@Controller("projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Body() dto?: CreateProjectDto) {
    return this.projectService.create(dto)
  }

  @Get()
  findAll() {
    return this.projectService.findAll()
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectService.findOne(id)
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(id, dto)
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectService.remove(id)
  }

  @Post(":id/resume")
  resume(@Param("id") id: string) {
    return this.projectService.resume(id)
  }

  @Post(":id/stop")
  stop(@Param("id") id: string) {
    return this.projectService.stop(id)
  }
}
