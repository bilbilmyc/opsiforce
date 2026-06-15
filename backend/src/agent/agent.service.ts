import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { agents } from '../../db/schema';
import { readAgentConfig } from './agent-config';
import { DEFAULT_AGENT_NAME, type AgentResponse } from './agent.types';

@Injectable()
export class AgentService {
  private defaultAgentIdCache: string | null = null;
  private readonly descriptionsByName = readAgentConfig().descriptions;

  async findAll(): Promise<AgentResponse[]> {
    const rows = await db
      .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
      .from(agents)
      .orderBy(asc(agents.name));
    return rows.map((row) => ({
      ...row,
      description: this.descriptionsByName.get(row.name) ?? null,
    }));
  }

  async findById(id: string): Promise<AgentResponse> {
    const [row] = await db
      .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
      .from(agents)
      .where(eq(agents.id, id));
    if (!row) throw new NotFoundException(`Agent ${id} not found`);
    return { ...row, description: this.descriptionsByName.get(row.name) ?? null };
  }

  async resolveName(id: string): Promise<string> {
    const [row] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, id));
    if (!row) throw new NotFoundException(`Agent ${id} not found`);
    return row.name;
  }

  /**
   * Default agent for new projects when the create DTO doesn't specify one.
   * Resolved from the `agents` table by well-known name and cached for the
   * process lifetime. The seed migration guarantees this row exists.
   */
  async getDefaultAgentId(): Promise<string> {
    if (this.defaultAgentIdCache) return this.defaultAgentIdCache;
    const [row] = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, DEFAULT_AGENT_NAME));
    if (!row) {
      throw new Error(`Default agent "${DEFAULT_AGENT_NAME}" not found in agents table`);
    }
    this.defaultAgentIdCache = row.id;
    return row.id;
  }
}
