import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"
import { CurrentUser, type UserContext } from "./user.decorator"
import {
  UserService,
  type UpdateWorkspacePreferencesDto,
  type UserRecord,
  type WorkspacePreferencesResponse,
} from "./user.service"

@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermission(Perms.manageWorkspaces)
  listUsers(): Promise<UserRecord[]> {
    return this.userService.listAll()
  }

  @Post("me")
  async getOrCreateMe(@Req() req: FastifyRequest): Promise<UserRecord> {
    const keycloakId = req.headers["x-forwarded-user"] as string | undefined
    if (!keycloakId) {
      throw new UnauthorizedException("Missing x-forwarded-user header")
    }
    const email = req.headers["x-forwarded-email"] as string | undefined
    const displayName = req.headers["x-forwarded-preferred-username"] as string | undefined
    return this.userService.getOrCreateUser({ keycloakId, email, displayName })
  }

  /** Mirror of POST /users/me — handy for frontends that prefer GET for reads. */
  @Get("me")
  async getMe(@CurrentUser() user: UserContext): Promise<UserRecord> {
    return this.userService.getOrCreateUser({
      keycloakId: user.userId,
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
    })
  }

  @Get("me/workspace-preferences")
  async getWorkspacePreferences(
    @CurrentUser() user: UserContext,
  ): Promise<WorkspacePreferencesResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.userService.getWorkspacePreferences(dbUser.id)
  }

  @Patch("me/workspace-preferences")
  async updateWorkspacePreferences(
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateWorkspacePreferencesDto,
  ): Promise<WorkspacePreferencesResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.userService.updateWorkspacePreferences(dbUser.id, dto)
  }

  @Get(":id")
  @RequirePermission(Perms.manageWorkspaces)
  findOne(@Param("id") id: string): Promise<UserRecord> {
    return this.userService.findById(id)
  }

  private ensureDbUser(user: UserContext): Promise<UserRecord> {
    return this.userService.getOrCreateUser({
      keycloakId: user.userId,
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
    })
  }
}
