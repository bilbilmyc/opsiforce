import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { agents } from '../../db/schema';
import { DEFAULT_AGENT_NAME, type AgentResponse } from './agent.types';
import { isAgentEnabled, readMergedAgentRegistry } from './agent-config';

@Injectable()
export class AgentService {
  private defaultAgentIdCache: string | null = null;

  async findAll(): Promise<AgentResponse[]> {
    const rows = await db
      .select({ id: agents.id, name: agents.name, displayName: agents.displayName, description: agents.description })
      .from(agents)
      .orderBy(asc(agents.name));
    const registry = readMergedAgentRegistry();
    return rows.filter(row => isAgentEnabled(registry.agents[row.name]));
  }

  async assertCreatable(id: string): Promise<void> {
    const agent = await this.findById(id);
    if (!isAgentEnabled(readMergedAgentRegistry().agents[agent.name])) {
      throw new BadRequestException('This project template is not enabled on this deployment');
    }
  }

  async findById(id: string): Promise<AgentResponse> {
    const [row] = await db
      .select({ id: agents.id, name: agents.name, displayName: agents.displayName, description: agents.description })
      .from(agents)
      .where(eq(agents.id, id));
    if (!row) throw new NotFoundException(`Agent ${id} not found`);
    return row;
  }

  async resolveName(id: string): Promise<string> {
    const [row] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, id));
    if (!row) throw new NotFoundException(`Agent ${id} not found`);
    return row.name;
  }

  async findIdByName(name: string): Promise<string | null> {
    const [row] = await db.select({ id: agents.id }).from(agents).where(eq(agents.name, name));
    return row?.id ?? null;
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
