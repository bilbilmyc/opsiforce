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
