import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectApps } from '../../db/schema';
import type { ProjectAppMeta } from './project.types';

@Injectable()
export class AppService {
  async get(projectEnvironmentId: string): Promise<ProjectAppMeta | null> {
    const [row] = await db
      .select({ name: projectApps.name, description: projectApps.description })
      .from(projectApps)
      .where(eq(projectApps.projectEnvironmentId, projectEnvironmentId));
    if (!row) return null;
    return { exists: true, name: row.name, description: row.description };
  }

  async upsertProjectApp(
    projectEnvironmentId: string,
    projectId: string,
    meta: { name: string | null; description: string | null }
  ): Promise<boolean> {
    const existing = await this.get(projectEnvironmentId);
    if (existing && existing.name === meta.name && existing.description === meta.description) {
      return false;
    }

    await db
      .insert(projectApps)
      .values({
        projectEnvironmentId,
        projectId,
        name: meta.name,
        description: meta.description,
      })
      .onConflictDoUpdate({
        target: projectApps.projectEnvironmentId,
        set: {
          name: meta.name,
          description: meta.description,
          updatedAt: new Date(),
        },
      });

    return true;
  }
}
