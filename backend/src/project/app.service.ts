import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectApps } from '../../db/schema';
import type { ProjectAppMeta } from './project.types';

@Injectable()
export class AppService {
  async get(projectId: string): Promise<ProjectAppMeta | null> {
    const [row] = await db
      .select({ name: projectApps.name, description: projectApps.description })
      .from(projectApps)
      .where(eq(projectApps.projectId, projectId));
    if (!row) return null;
    return { exists: true, name: row.name, description: row.description };
  }

  async upsertProjectApp(projectId: string, meta: { name: string | null; description: string | null }): Promise<void> {
    await db
      .insert(projectApps)
      .values({
        projectId,
        name: meta.name,
        description: meta.description,
      })
      .onConflictDoUpdate({
        target: projectApps.projectId,
        set: {
          name: meta.name,
          description: meta.description,
          updatedAt: new Date(),
        },
      });
  }
}
