import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import path from 'path';
import type { Database } from 'sqlite';
import {
  environmentDatabasePath,
  openEnvironmentDatabase,
  type SqlitePragmaProfile,
} from '../../common/environment-database';
import type { StoredMessage } from './external-service-definition';

export const EXTERNAL_SERVICES_DATABASE_FILE = 'external-services.db';

const EXTERNAL_SERVICES_PRAGMAS: SqlitePragmaProfile = {
  journalMode: 'TRUNCATE',
  busyTimeoutMs: 5000,
  synchronous: 'FULL',
};

const STORE_MIGRATIONS = [
  `CREATE TABLE messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     service TEXT NOT NULL,
     received_at TEXT NOT NULL,
     raw_payload TEXT NOT NULL,
     app_delivered_at TEXT,
     provider_message_id TEXT NOT NULL,
     routing_key TEXT NOT NULL,
     sender TEXT,
     text_body TEXT,
     payload TEXT NOT NULL
   );
   CREATE UNIQUE INDEX messages_service_provider_message_id
     ON messages (service, provider_message_id);
   CREATE TABLE attachments (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     message_id INTEGER NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
     filename TEXT,
     content_type TEXT,
     size_bytes INTEGER NOT NULL,
     content BLOB
   );`,
] as const;

const INSERT_MESSAGE = `INSERT OR IGNORE INTO messages
   (service, received_at, raw_payload, provider_message_id, routing_key, sender, text_body, payload)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_ATTACHMENT = `INSERT INTO attachments (message_id, filename, content_type, size_bytes, content)
   VALUES (?, ?, ?, ?, ?)`;

@Injectable()
export class ExternalServiceStore {
  private readonly logger = new Logger(ExternalServiceStore.name);

  async store(envDirectory: string, serviceName: string, messages: StoredMessage[]): Promise<number[]> {
    const databasePath = environmentDatabasePath(envDirectory, EXTERNAL_SERVICES_DATABASE_FILE);
    await mkdir(path.dirname(databasePath), { recursive: true });

    const connection = await openEnvironmentDatabase(
      envDirectory,
      EXTERNAL_SERVICES_DATABASE_FILE,
      EXTERNAL_SERVICES_PRAGMAS
    );
    try {
      return await this.insertMessages(connection, serviceName, messages);
    } finally {
      await connection.close().catch(() => {});
    }
  }

  async markDelivered(envDirectory: string, rowIds: number[]): Promise<void> {
    if (rowIds.length === 0) return;

    const connection = await openEnvironmentDatabase(
      envDirectory,
      EXTERNAL_SERVICES_DATABASE_FILE,
      EXTERNAL_SERVICES_PRAGMAS
    );
    try {
      await connection.run(
        `UPDATE messages SET app_delivered_at = ? WHERE id IN (${placeholders(rowIds.length)})`,
        new Date().toISOString(),
        ...rowIds
      );
    } finally {
      await connection.close().catch(() => {});
    }
  }

  private async insertMessages(
    connection: Database,
    serviceName: string,
    messages: StoredMessage[]
  ): Promise<number[]> {
    const insertedIds: number[] = [];

    await connection.exec('BEGIN IMMEDIATE');
    try {
      await this.applyMigrations(connection);

      for (const message of messages) {
        const messageId = await this.insertMessage(connection, serviceName, message);
        if (messageId === null) {
          this.logger.log(`Duplicate ${serviceName} message ${message.providerMessageId} ignored`);
          continue;
        }
        await insertAttachments(connection, messageId, message);
        insertedIds.push(messageId);
      }
      await connection.exec('COMMIT');
    } catch (err) {
      await connection.exec('ROLLBACK').catch(() => {});
      throw err;
    }

    return insertedIds;
  }

  private async applyMigrations(connection: Database): Promise<void> {
    const row = await connection.get<{ user_version: number }>('PRAGMA user_version');
    const appliedVersion = row?.user_version ?? 0;
    if (appliedVersion >= STORE_MIGRATIONS.length) return;

    for (let version = appliedVersion; version < STORE_MIGRATIONS.length; version++) {
      await connection.exec(STORE_MIGRATIONS[version]);
    }
    await connection.exec(`PRAGMA user_version = ${STORE_MIGRATIONS.length}`);

    this.logger.log(`Applied external-services schema migrations ${appliedVersion + 1}..${STORE_MIGRATIONS.length}`);
  }

  private async insertMessage(
    connection: Database,
    serviceName: string,
    message: StoredMessage
  ): Promise<number | null> {
    const result = await connection.run(
      INSERT_MESSAGE,
      serviceName,
      new Date().toISOString(),
      message.rawPayload,
      message.providerMessageId,
      message.routingKey,
      message.sender,
      message.textBody,
      JSON.stringify(message.payload)
    );

    if (!result.changes || result.lastID === undefined) return null;
    return result.lastID;
  }
}

async function insertAttachments(connection: Database, messageId: number, message: StoredMessage): Promise<void> {
  for (const attachment of message.attachments) {
    await connection.run(
      INSERT_ATTACHMENT,
      messageId,
      attachment.filename,
      attachment.contentType,
      attachment.sizeBytes,
      attachment.content
    );
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
