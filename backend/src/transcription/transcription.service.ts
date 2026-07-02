import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TRANSCRIPTION_MODEL, TRANSCRIPTION_TIMEOUT_MS, type TranscriptionLanguage } from './transcription.constants';

interface TranscribeParams {
  keyToken: string;
  audio: Buffer;
  mimeType: string;
  extension: string;
  language?: TranscriptionLanguage;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly proxyUrl: string;

  constructor(configService: ConfigService) {
    this.proxyUrl = configService.get<string>('bifrostProxyUrl', '');
  }

  async transcribe(params: TranscribeParams): Promise<string> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(params.audio)], { type: params.mimeType }),
      `dictation.${params.extension}`
    );
    form.append('model', TRANSCRIPTION_MODEL);
    form.append('response_format', 'json');
    if (params.language) form.append('language', params.language);

    const url = `${this.proxyUrl.replace(/\/v1\/?$/, '')}/v1/audio/transcriptions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.keyToken}` },
        body: form,
        signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new GatewayTimeoutException('Transcription timed out');
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Transcription gateway unreachable: ${message}`);
      throw new BadGatewayException('Transcription gateway unreachable');
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 402 || /budget/i.test(detail)) {
        throw new HttpException('Project AI budget exhausted', HttpStatus.PAYMENT_REQUIRED);
      }
      this.logger.warn(`Transcription failed (${response.status}): ${detail.slice(0, 500)}`);
      throw new BadGatewayException('Transcription failed');
    }

    const payload = (await response.json()) as { text?: string };
    return typeof payload.text === 'string' ? payload.text : '';
  }
}
