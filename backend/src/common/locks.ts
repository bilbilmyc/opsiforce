import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../../db';

export type DbExecutor = DrizzleDB | Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

export async function lockProjectGit(executor: DbExecutor, projectId: string): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext('opsiforce:project-git'), hashtext(${projectId}))`);
}
