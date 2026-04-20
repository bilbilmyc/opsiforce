import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import {
  getEmailHeader,
  getUserIdHeader,
  getUsernameHeader,
} from "../permission/permission.utils"

export interface UserContext {
  userId: string
  username: string
  email: string | null
  displayName: string | null
}

/**
 * Injects the current authenticated user into a controller handler.
 *
 * Pure header extraction — reads x-forwarded-user / x-forwarded-preferred-username /
 * x-forwarded-email set by oauth2-proxy. No DB touch. Throws 401 if headers are
 * missing.
 *
 * Note: a UserContext from @CurrentUser is not guaranteed to exist as a row in
 * the `users` table — only that the oauth2-proxy saw the user. Handlers that
 * need to reference the user via foreign key (workspace_members, user_workspace_preferences)
 * must call UserService.syncFromHeaders() first to upsert the row.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>()
    const userId = getUserIdHeader(request)
    const username = getUsernameHeader(request)
    if (!userId || !username) {
      throw new UnauthorizedException("No authenticated user")
    }
    return {
      userId,
      username,
      email: getEmailHeader(request),
      displayName: username,
    }
  },
)
