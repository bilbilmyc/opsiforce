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
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"

@Controller("projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Body() dto: CreateProjectDto | undefined, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.create(dto, tenant.tenantId)
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.projectService.findAll(tenant.tenantId)
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.findOne(id, tenant.tenantId)
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjectDto, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.update(id, dto, tenant.tenantId)
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.remove(id, tenant.tenantId)
  }
}
