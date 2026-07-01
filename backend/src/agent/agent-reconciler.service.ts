import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { agents } from '../../db/schema';
import { type AgentRegistry, readMergedAgentRegistry } from './agent-config';

@Injectable()
export class AgentReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(AgentReconcilerService.name);

  async onModuleInit(): Promise<void> {
    await this.reconcile(readMergedAgentRegistry());
  }

  async reconcile(registry: AgentRegistry): Promise<void> {
    const entries = Object.entries(registry.agents);
    for (const [slug, entry] of entries) {
      const displayName = entry.name ?? null;
      const description = entry.description ?? null;
      await db
        .insert(agents)
        .values({ id: crypto.randomUUID(), name: slug, displayName, description })
        .onConflictDoUpdate({
          target: agents.name,
          set: {
            displayName: sql`coalesce(${displayName}, ${agents.displayName})`,
            description: sql`coalesce(${description}, ${agents.description})`,
          },
        });
    }
    this.logger.log(`Reconciled ${entries.length} agent(s) from registry`);
  }
}
