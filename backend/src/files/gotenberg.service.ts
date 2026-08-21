import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveContentType } from './file-content-types';
import { ConversionFailure, type ConversionOutcome } from './file-conversion.types';

const CONVERT_PATH = '/forms/libreoffice/convert';
const REQUEST_TIMEOUT_MS = 90_000;
const BUSY_STATUSES = new Set([429, 503, 504]);

export interface GotenbergConversionInput {
  name: string;
  bytes: Buffer;
  traceId: string;
}

@Injectable()
export class GotenbergService {
  private readonly logger = new Logger(GotenbergService.name);
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('gotenbergUrl').replace(/\/+$/, '');
  }

  async convertToPdf(input: GotenbergConversionInput): Promise<ConversionOutcome> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(input.bytes)], { type: resolveContentType(input.name) }), input.name);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${CONVERT_PATH}`, {
        method: 'POST',
        headers: { 'Gotenberg-Trace': input.traceId },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        this.logger.warn(`Conversion of ${input.name} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        return { ok: false, failure: ConversionFailure.Busy, error: 'The converter did not respond in time' };
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Converter unreachable for ${input.name}: ${message}`);
      return { ok: false, failure: ConversionFailure.Retryable, error: 'The converter is unreachable' };
    }

    if (response.ok) {
      return { ok: true, pdf: Buffer.from(await response.arrayBuffer()) };
    }

    const detail = await response.text().catch(() => '');
    this.logger.warn(`Conversion of ${input.name} failed (${response.status}): ${detail.slice(0, 500)}`);

    if (response.status === 400) {
      return { ok: false, failure: ConversionFailure.Unconvertible, error: 'This document could not be converted' };
    }
    if (BUSY_STATUSES.has(response.status)) {
      return { ok: false, failure: ConversionFailure.Busy, error: 'The converter is busy' };
    }
    return { ok: false, failure: ConversionFailure.Retryable, error: 'The converter failed' };
  }
}
