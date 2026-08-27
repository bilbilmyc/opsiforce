import { Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FileHandle } from 'fs/promises';

export interface ByteRange {
  start: number;
  end: number;
}

export interface FileStreamInput {
  req: FastifyRequest;
  reply: FastifyReply;
  handle: FileHandle;
  name: string;
  status: number;
  headers: Record<string, string | number>;
  range?: ByteRange;
  logger: Logger;
}

export function streamWorkspaceFile(input: FileStreamInput): void {
  const { req, reply, handle, name, status, headers, range, logger } = input;

  reply.hijack();
  reply.raw.writeHead(status, headers);

  const stream = range ? handle.createReadStream(range) : handle.createReadStream();
  const abort = () => stream.destroy();
  req.raw.on('close', abort);
  stream.on('error', (err: Error) => {
    logger.error(`Streaming failed for ${name}: ${err.message}`);
    req.raw.off('close', abort);
    reply.raw.destroy();
  });
  stream.on('end', () => req.raw.off('close', abort));
  stream.on('close', () => {
    handle.close().catch(() => {});
  });
  stream.pipe(reply.raw);
}
