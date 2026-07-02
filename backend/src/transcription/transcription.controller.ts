import {
  BadRequestException,
  Controller,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import { FastifyRequest } from 'fastify';
import { TranscriptionService } from './transcription.service';
import {
  audioExtensionFor,
  isTranscriptionLanguage,
  MAX_AUDIO_BYTES,
  MAX_REQUEST_BYTES,
  type TranscriptionLanguage,
} from './transcription.constants';
import { BifrostService } from '../bifrost/bifrost.service';
import { ProjectService } from '../project/project.service';
import { ProjectEnvironmentService } from '../project-environment/project-environment.service';
import { UserService } from '../user/user.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

interface MultipartRequest extends FastifyRequest {
  parts(options?: { limits?: { fileSize?: number; fields?: number } }): AsyncIterableIterator<Multipart>;
}

interface AudioRecording {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

@Controller('projects')
export class TranscriptionController {
  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly bifrostService: BifrostService,
    private readonly projectService: ProjectService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly userService: UserService
  ) {}

  @Post(':projectId/transcription')
  async transcribe(
    @Param('projectId') projectId: string,
    @Query('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: MultipartRequest
  ): Promise<{ text: string }> {
    const dbUser = await this.userService.getOrCreateUser(
      { keycloakId: user.userId, email: user.email ?? undefined, displayName: user.displayName ?? undefined },
      tenant.tenantId
    );
    await this.projectService.findOneForUser({
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
    });

    const env = await this.projectEnvironmentService.findRequestedForProject(projectId, environmentId);
    const projectEnvironmentId = env?.id;

    if (!this.bifrostService.isEnabled()) {
      throw new ServiceUnavailableException('Transcription is not available');
    }

    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new PayloadTooLargeException('Audio recording exceeds the 10 MB limit');
    }

    this.projectService.touchActivity(environmentId ?? projectId).catch(() => {});

    const { audio, language } = await this.readRecording(req);

    const keyToken = await this.bifrostService.getProjectChatKeyToken(projectId, projectEnvironmentId);
    if (!keyToken) {
      throw new ServiceUnavailableException('Transcription is not available');
    }

    const text = await this.transcriptionService.transcribe({
      keyToken,
      audio: audio.buffer,
      mimeType: audio.mimeType,
      extension: audio.extension,
      language,
    });
    return { text };
  }

  private async readRecording(
    req: MultipartRequest
  ): Promise<{ audio: AudioRecording; language?: TranscriptionLanguage }> {
    let audio: AudioRecording | undefined;
    let requestedLanguage: string | undefined;

    for await (const part of req.parts({ limits: { fileSize: MAX_AUDIO_BYTES, fields: 16 } })) {
      if (part.type !== 'file') {
        if (part.fieldname === 'language' && typeof part.value === 'string') {
          requestedLanguage = part.value.trim().toLowerCase() || undefined;
        }
        continue;
      }
      if (audio) {
        drainPart(part);
        continue;
      }
      const extension = audioExtensionFor(part.mimetype);
      if (!extension) {
        drainPart(part);
        throw new UnsupportedMediaTypeException(`Unsupported audio format: ${part.mimetype}`);
      }
      let buffer: Buffer;
      try {
        buffer = await part.toBuffer();
      } catch (err) {
        if (part.file.truncated) {
          throw new PayloadTooLargeException('Audio recording exceeds the 10 MB limit');
        }
        throw err;
      }
      audio = { buffer, mimeType: part.mimetype, extension };
    }

    if (!audio) throw new BadRequestException('Missing audio file');

    let language: TranscriptionLanguage | undefined;
    if (requestedLanguage) {
      if (!isTranscriptionLanguage(requestedLanguage)) {
        throw new BadRequestException(`Unsupported language: ${requestedLanguage}`);
      }
      language = requestedLanguage;
    }

    return { audio, language };
  }
}

function drainPart(part: MultipartFile) {
  const stream = part.file;
  if (stream.destroyed) return;
  stream.on('error', () => {});
  stream.resume();
}
