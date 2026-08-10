import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { ExternalServiceConfigStore } from '../platform/external-service-config-store.service';
import type { JsonValue } from '../platform/external-service-definition';

export const INCOMING_EMAIL_SERVICE = 'incoming-email';

const LOCAL_PART_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LOCAL_PART_LENGTH = 16;
const MAX_ADDRESS_ATTEMPTS = 5;

function randomLocalPart(): string {
  let localPart = '';
  for (let index = 0; index < LOCAL_PART_LENGTH; index++) {
    localPart += LOCAL_PART_ALPHABET.charAt(randomInt(LOCAL_PART_ALPHABET.length));
  }
  return localPart;
}

function addressOf(config: JsonValue | null): string | null {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;
  return typeof config.address === 'string' ? config.address : null;
}

@Injectable()
export class IncomingEmailAddressService {
  private readonly logger = new Logger(IncomingEmailAddressService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly store: ExternalServiceConfigStore
  ) {}

  async findAddress(projectEnvironmentId: string): Promise<string | null> {
    return addressOf(await this.store.getConfig(INCOMING_EMAIL_SERVICE, projectEnvironmentId));
  }

  async findEnvironmentIdByAddress(address: string): Promise<string | null> {
    const wanted = address.toLowerCase();
    const configs = await this.store.listConfigs(INCOMING_EMAIL_SERVICE);
    return configs.find((config) => addressOf(config.value) === wanted)?.projectEnvironmentId ?? null;
  }

  async getOrCreateAddress(projectEnvironmentId: string): Promise<string> {
    const existing = await this.findAddress(projectEnvironmentId);
    if (existing) return existing;

    const address = await this.allocateAddress();
    await this.store.upsertConfig(INCOMING_EMAIL_SERVICE, projectEnvironmentId, { address });
    this.logger.log(`Issued incoming-email address for environment ${projectEnvironmentId}`);
    return address;
  }

  async regenerateAddress(projectEnvironmentId: string): Promise<string> {
    const address = await this.allocateAddress();
    await this.store.upsertConfig(INCOMING_EMAIL_SERVICE, projectEnvironmentId, { address });
    this.logger.log(`Rotated incoming-email address for environment ${projectEnvironmentId}`);
    return address;
  }

  private async allocateAddress(): Promise<string> {
    const domain = this.receiveDomain();

    for (let attempt = 0; attempt < MAX_ADDRESS_ATTEMPTS; attempt++) {
      const address = `${randomLocalPart()}@${domain}`.toLowerCase();
      if (!(await this.findEnvironmentIdByAddress(address))) return address;
    }

    throw new ServiceUnavailableException('Could not allocate a unique incoming-email address, please retry');
  }

  private receiveDomain(): string {
    const domain = this.configService.get<string>('mailgunReceiveDomain', '').trim();
    if (!domain) {
      throw new ServiceUnavailableException('Incoming email is not configured on this platform');
    }
    return domain;
  }
}
