import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { randomInt } from 'crypto';
import { db } from '../../db';
import { incomingEmailAddresses } from '../../db/schema';

const LOCAL_PART_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LOCAL_PART_LENGTH = 16;
const MAX_ADDRESS_ATTEMPTS = 5;
const ADDRESS_UNIQUE_CONSTRAINT = 'incoming_email_addresses_address_unique';

function randomLocalPart(): string {
  let localPart = '';
  for (let index = 0; index < LOCAL_PART_LENGTH; index++) {
    localPart += LOCAL_PART_ALPHABET.charAt(randomInt(LOCAL_PART_ALPHABET.length));
  }
  return localPart;
}

function matchesAddressUniqueViolation(err: object): boolean {
  if (!('code' in err) || !('constraint_name' in err)) return false;
  return err.code === '23505' && err.constraint_name === ADDRESS_UNIQUE_CONSTRAINT;
}

function isAddressConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (matchesAddressUniqueViolation(err)) return true;
  return (
    'cause' in err && typeof err.cause === 'object' && err.cause !== null && matchesAddressUniqueViolation(err.cause)
  );
}

type ReplaceAddressResult = { outcome: 'replaced'; address: string } | { outcome: 'missing' } | { outcome: 'conflict' };

@Injectable()
export class IncomingEmailAddressService {
  private readonly logger = new Logger(IncomingEmailAddressService.name);

  constructor(private readonly configService: ConfigService) {}

  async findAddress(projectEnvironmentId: string): Promise<string | null> {
    const [row] = await db
      .select({ address: incomingEmailAddresses.address })
      .from(incomingEmailAddresses)
      .where(eq(incomingEmailAddresses.projectEnvironmentId, projectEnvironmentId));

    return row?.address ?? null;
  }

  async findEnvironmentIdByAddress(address: string): Promise<string | null> {
    const [row] = await db
      .select({ projectEnvironmentId: incomingEmailAddresses.projectEnvironmentId })
      .from(incomingEmailAddresses)
      .where(eq(incomingEmailAddresses.address, address.toLowerCase()));

    return row?.projectEnvironmentId ?? null;
  }

  async getOrCreateAddress(projectEnvironmentId: string): Promise<string> {
    const existing = await this.findAddress(projectEnvironmentId);
    if (existing) return existing;

    const domain = this.receiveDomain();

    for (let attempt = 0; attempt < MAX_ADDRESS_ATTEMPTS; attempt++) {
      const [inserted] = await db
        .insert(incomingEmailAddresses)
        .values({ projectEnvironmentId, address: this.buildAddress(domain) })
        .onConflictDoNothing()
        .returning({ address: incomingEmailAddresses.address });

      if (inserted) {
        this.logger.log(`Issued incoming-email address for environment ${projectEnvironmentId}`);
        return inserted.address;
      }

      const concurrent = await this.findAddress(projectEnvironmentId);
      if (concurrent) return concurrent;
    }

    throw new ServiceUnavailableException('Could not allocate a unique incoming-email address, please retry');
  }

  async regenerateAddress(projectEnvironmentId: string): Promise<string> {
    const domain = this.receiveDomain();

    for (let attempt = 0; attempt < MAX_ADDRESS_ATTEMPTS; attempt++) {
      const result = await this.tryReplaceAddress(projectEnvironmentId, this.buildAddress(domain));

      if (result.outcome === 'replaced') {
        this.logger.log(`Rotated incoming-email address for environment ${projectEnvironmentId}`);
        return result.address;
      }

      if (result.outcome === 'missing') {
        return this.getOrCreateAddress(projectEnvironmentId);
      }
    }

    throw new ServiceUnavailableException('Could not allocate a unique incoming-email address, please retry');
  }

  private async tryReplaceAddress(projectEnvironmentId: string, address: string): Promise<ReplaceAddressResult> {
    try {
      const [updated] = await db
        .update(incomingEmailAddresses)
        .set({ address, updatedAt: new Date() })
        .where(eq(incomingEmailAddresses.projectEnvironmentId, projectEnvironmentId))
        .returning({ address: incomingEmailAddresses.address });

      if (!updated) return { outcome: 'missing' };
      return { outcome: 'replaced', address: updated.address };
    } catch (err) {
      if (isAddressConflict(err)) return { outcome: 'conflict' };
      throw err;
    }
  }

  private buildAddress(domain: string): string {
    return `${randomLocalPart()}@${domain}`.toLowerCase();
  }

  private receiveDomain(): string {
    const domain = this.configService.get<string>('mailgunReceiveDomain', '').trim();
    if (!domain) {
      throw new ServiceUnavailableException('Incoming email is not configured on this platform');
    }
    return domain;
  }
}
