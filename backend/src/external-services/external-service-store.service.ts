import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'fs/promises';
import path from 'path';
import type { Database } from 'sqlite';
import {
  environmentDatabasePath,
  openEnvironmentDatabase,
  type SqlitePragmaProfile,
} from '../common/environment-database';
import type { ExternalServiceDefinition, ExternalServiceRow, SqliteValue } from './external-service-definition';

export const EXTERNAL_SERVICES_DATABASE_FILE = 'external-services.db';

const EXTERNAL_SERVICES_PRAGMAS: SqlitePragmaProfile = {
  journalMode: 'TRUNCATE',
  busyTimeoutMs: 5000,
  synchronous: 'FULL',
};

const SCHEMA_VERSIONS_DDL =
  'CREATE TABLE IF NOT EXISTS _schema_versions (service TEXT PRIMARY KEY, version INTEGER NOT NULL)';

@Injectable()
export class ExternalServiceStore {
  private readonly logger = new Logger(ExternalServiceStore.name);

  async store(
    envDirectory: string,
    definition: ExternalServiceDefinition,
    rows: ExternalServiceRow[]
  ): Promise<number[]> {
    const databasePath = environmentDatabasePath(envDirectory, EXTERNAL_SERVICES_DATABASE_FILE);
    await mkdir(path.dirname(databasePath), { recursive: true });

    const connection = await openEnvironmentDatabase(
      envDirectory,
      EXTERNAL_SERVICES_DATABASE_FILE,
      EXTERNAL_SERVICES_PRAGMAS
    );
    try {
      await this.ensureSchema(connection, definition);
      return await this.insertRows(connection, definition, rows);
    } finally {
      await connection.close().catch(() => {});
    }
  }

  async markDelivered(envDirectory: string, definition: ExternalServiceDefinition, rowIds: number[]): Promise<void> {
    if (rowIds.length === 0) return;

    const connection = await openEnvironmentDatabase(
      envDirectory,
      EXTERNAL_SERVICES_DATABASE_FILE,
      EXTERNAL_SERVICES_PRAGMAS
    );
    try {
      await connection.run(
        `UPDATE ${definition.messageTable} SET app_delivered_at = ? WHERE id IN (${placeholders(rowIds.length)})`,
        new Date().toISOString(),
        ...rowIds
      );
    } finally {
      await connection.close().catch(() => {});
    }
  }

  private async ensureSchema(connection: Database, definition: ExternalServiceDefinition): Promise<void> {
    await connection.exec(SCHEMA_VERSIONS_DDL);

    const applied = await connection.get<{ version: number }>(
      'SELECT version FROM _schema_versions WHERE service = ?',
      definition.serviceName
    );
    const appliedVersion = applied?.version ?? 0;
    if (appliedVersion >= definition.migrations.length) return;

    await connection.exec('BEGIN IMMEDIATE');
    try {
      for (let version = appliedVersion; version < definition.migrations.length; version++) {
        await connection.exec(definition.migrations[version]);
      }
      await connection.run(
        'INSERT INTO _schema_versions (service, version) VALUES (?, ?) ON CONFLICT(service) DO UPDATE SET version = excluded.version',
        definition.serviceName,
        definition.migrations.length
      );
      await connection.exec('COMMIT');
    } catch (err) {
      await connection.exec('ROLLBACK').catch(() => {});
      throw err;
    }

    this.logger.log(
      `Applied ${definition.serviceName} schema migrations ${appliedVersion + 1}..${definition.migrations.length}`
    );
  }

  private async insertRows(
    connection: Database,
    definition: ExternalServiceDefinition,
    rows: ExternalServiceRow[]
  ): Promise<number[]> {
    const insertedIds: number[] = [];

    await connection.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const messageId = await this.insertMessage(connection, definition, row);
        if (messageId === null) {
          this.logger.log(`Duplicate ${definition.serviceName} message ${row.providerMessageId} ignored`);
          continue;
        }
        await this.insertAttachments(connection, definition, messageId, row);
        insertedIds.push(messageId);
      }
      await connection.exec('COMMIT');
    } catch (err) {
      await connection.exec('ROLLBACK').catch(() => {});
      throw err;
    }

    return insertedIds;
  }

  private async insertMessage(
    connection: Database,
    definition: ExternalServiceDefinition,
    row: ExternalServiceRow
  ): Promise<number | null> {
    const values: Record<string, SqliteValue> = {
      received_at: new Date().toISOString(),
      raw_payload: row.rawPayload,
      ...row.columns,
    };
    const result = await connection.run(
      insertStatement(definition.messageTable, Object.keys(values)),
      ...Object.values(values)
    );

    if (!result.changes || result.lastID === undefined) return null;
    return result.lastID;
  }

  private async insertAttachments(
    connection: Database,
    definition: ExternalServiceDefinition,
    messageId: number,
    row: ExternalServiceRow
  ): Promise<void> {
    const { attachmentTable, attachmentParentColumn } = definition;
    if (!attachmentTable || !attachmentParentColumn) return;

    for (const attachment of row.attachments) {
      const values: Record<string, SqliteValue> = { [attachmentParentColumn]: messageId, ...attachment };
      await connection.run(insertStatement(attachmentTable, Object.keys(values)), ...Object.values(values));
    }
  }
}

function insertStatement(table: string, columns: string[]): string {
  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
