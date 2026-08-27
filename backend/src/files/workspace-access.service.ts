import { Injectable } from '@nestjs/common';
import { ProjectService } from '../project/project.service';
import { ProjectEnvironmentService } from '../project-environment/project-environment.service';
import { UserService } from '../user/user.service';
import type { TenantContext } from '../tenant/tenant.decorator';
import type { UserContext } from '../user/user.decorator';

@Injectable()
export class WorkspaceAccessService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly userService: UserService
  ) {}

  async resolveDirectory(
    projectId: string,
    environmentId: string | undefined,
    tenant: TenantContext,
    user: UserContext
  ): Promise<string> {
    const userId = await this.userService.resolveUserId(user, tenant.tenantId);
    const project = await this.projectService.findOneForUser({ projectId, tenantId: tenant.tenantId, userId });

    const env = await this.projectEnvironmentService.findRequestedForProject(projectId, environmentId);
    return env?.directory ?? project.directory;
  }

  touchActivity(projectId: string, environmentId: string | undefined): void {
    this.projectService.touchActivity(environmentId ?? projectId).catch(() => {});
  }
}
