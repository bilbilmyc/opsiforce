import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export const SingleQuery = createParamDecorator((name: string, ctx: ExecutionContext): string | undefined => {
  const query = ctx.switchToHttp().getRequest<FastifyRequest>().query as Record<string, unknown> | undefined;
  const value = query?.[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`Repeated query parameter: ${name}`);
  return value;
});
