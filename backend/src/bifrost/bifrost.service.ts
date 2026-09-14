import { BadRequestException, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db';
import { projectVirtualKeys, projectEnvironments, tenants, projects } from '../../db/schema';
import { DefaultsService } from '../defaults/defaults.service';
import type { BudgetDefaults } from '../defaults/defaults.types';
import type {
  KeyType,
  BifrostBudget,
  CreateVirtualKeyRequest,
  CreateVirtualKeyResponse,
  DeleteVirtualKeyResponse,
  CreateCustomerRequest,
  CreateCustomerResponse,
  CreateTeamRequest,
  CreateTeamResponse,
} from './bifrost.types';
import { availableModels, providerGrants, runtimeModelConfig, type Channel, type ChannelKey, type ChannelModel } from './bifrost.catalog';
import { agentModelDefaults } from '../../db/schema';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

@Injectable()
export class BifrostService implements OnModuleInit, OnModuleDestroy {
  private syncTimer?: ReturnType<typeof setInterval>;
  private syncPending?: Promise<void>;
  private catalogPending?: Promise<ChannelModel[]>;
  private catalogCache?: { at: number; models: ChannelModel[] };
  private grantsApplied = new Map<string, string>();
  private resourcePending = new Map<string, Promise<void>>();
  private readonly logger = new Logger(BifrostService.name);
  private readonly proxyUrl: string;
  private readonly podProxyUrl: string;
  private readonly adminUsername: string;
  private readonly adminPassword: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly defaultsService: DefaultsService
  ) {
    this.proxyUrl = this.configService.get<string>('bifrostProxyUrl', '');
    this.podProxyUrl = this.configService.get<string>('bifrostPodProxyUrl', '') || this.proxyUrl;
    this.adminUsername = this.configService.get<string>('bifrostAdminUsername', '');
    this.adminPassword = this.configService.get<string>('bifrostAdminPassword', '');
  }

  onModuleInit() {
    if (!this.isEnabled()) return;
    this.syncTimer = setInterval(() => {
      void this.syncModels().catch(err => this.logger.warn(`Bifrost model sync failed: ${err.message}`));
    }, 30_000);
    this.syncTimer.unref();
  }

  onModuleDestroy() { if (this.syncTimer) clearInterval(this.syncTimer); }

  async getModels(force = false): Promise<ChannelModel[]> {
    if (!this.isEnabled()) return [];
    if (!force && this.catalogCache && Date.now() - this.catalogCache.at < 15_000) return this.catalogCache.models;
    if (this.catalogPending) return this.catalogPending;
    this.catalogPending = (async () => {
      const [providers, catalog] = await Promise.all([
        this.request<{ providers: Channel[] }>('GET', '/api/providers'),
        this.getCatalogModels(),
      ]);
      const channels = await Promise.all(providers.providers.map(async p => ({
        ...p, keys: (await this.request<{ keys: ChannelKey[] }>('GET', `/api/providers/${encodeURIComponent(p.name)}/keys`)).keys ?? [],
      })));
      const models = availableModels(channels, catalog);
      this.catalogCache = { at: Date.now(), models };
      return models;
    })();
    try { return await this.catalogPending; } finally { this.catalogPending = undefined; }
  }

  private async getCatalogModels(): Promise<ChannelModel[]> {
    const models: ChannelModel[] = [];
    const seen = new Set<string>();
    const limit = 100;
    // Bifrost defaults to five entries per page. Advance by the actual count,
    // since the server may cap the requested page size.
    for (let page = 0; page < 1000; page++) {
      const result = await this.request<{ models: ChannelModel[]; total: number }>(
        'GET', `/api/models/details?limit=${limit}&offset=${models.length}`
      );
      if (!Array.isArray(result.models) || !Number.isSafeInteger(result.total) || result.total < 0) {
        throw new Error('Bifrost returned an invalid model catalog page');
      }
      if (!result.models.length && models.length < result.total) {
        throw new Error('Bifrost model catalog pagination ended before the reported total');
      }
      for (const model of result.models) {
        const id = JSON.stringify([model.provider, model.name]);
        if (seen.has(id)) throw new Error('Bifrost model catalog changed during pagination; retry the refresh');
        seen.add(id);
        models.push(model);
      }
      if (models.length >= result.total) return models;
    }
    throw new Error('Bifrost model catalog exceeded the pagination safety limit');
  }

  async modelCatalog() {
    const models = await this.getModels();
    const [defaults] = await db.select().from(agentModelDefaults).where(eq(agentModelDefaults.id, 'default'));
    return { models, defaultModel: models.length ? runtimeModelConfig(models, defaults?.model ?? null).model : null };
  }

  async setDefaultModel(model: unknown) {
    const models = await this.getModels(true);
    if (typeof model !== 'string' || !models.some(m => `${m.provider}/${m.name}` === model)) {
      throw new BadRequestException('请选择 Bifrost 当前可用的渠道和模型。');
    }
    await db.insert(agentModelDefaults).values({ id: 'default', model })
      .onConflictDoUpdate({ target: agentModelDefaults.id, set: { model, updatedAt: new Date() } });
    if (this.syncPending) await this.syncPending;
    await this.syncModels();
    return this.modelCatalog();
  }

  private async modelConfig() {
    const { models, defaultModel } = await this.modelCatalog();
    return runtimeModelConfig(models, defaultModel);
  }

  async syncModels(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.syncPending) return this.syncPending;
    this.syncPending = this.runModelSync();
    try { await this.syncPending; } finally { this.syncPending = undefined; }
  }

  private async runModelSync() {
    await this.getModels(true);
    const config = await this.modelConfig();
    const rows = await db.select({ id: projects.id, tenantId: projects.tenantId }).from(projects);
    const failures: string[] = [];
    for (const project of rows) {
      try {
        await this.ensureResources(project.id, project.tenantId);
        const environments = await db.select().from(projectEnvironments).where(eq(projectEnvironments.projectId, project.id));
        for (const env of environments) {
          const root = path.resolve(this.configService.get<string>('storageMountPath', '/workspace-data'));
          const file = path.resolve(root, env.directory, '.opencode/opencode.json');
          if (!file.startsWith(root + path.sep)) throw new Error('Invalid workspace directory');
          let current;
          try { current = JSON.parse(await readFile(file, 'utf8')); }
          catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; throw err; }
          const agentName = current.default_agent || 'app-builder';
          const next = { ...current, ...config, agents: { ...current.agents,
            [agentName]: { ...current.agents?.[agentName], model: `${config.model}#default` },
          } };
          if (JSON.stringify(current) === JSON.stringify(next)) continue;
          const temp = `${file}.${crypto.randomUUID()}.tmp`;
          await writeFile(temp, JSON.stringify(next, null, 2) + '\n');
          await rename(temp, file);
        }
      } catch (err) {
        failures.push(project.id);
        this.logger.warn(`Model sync for project ${project.id} failed: ${(err as Error).message}`);
      }
    }
    if (failures.length) throw new Error(`模型已保存，但 ${failures.length} 个项目同步失败，请检查后端日志并重试刷新。`);
  }

  async createProjectResources(params: { projectId: string; tenantId: string }) {
    return this.ensureResources(params.projectId, params.tenantId);
  }

  async createOrphanProjectResources(params: { projectId: string }) {
    return this.ensureResources(params.projectId, null);
  }

  private async ensureResources(projectId: string, tenantId: string | null): Promise<void> {
    const pending = this.resourcePending.get(projectId);
    if (pending) return pending;
    const task = tenantId ? this.provisionProjectResources({ projectId, tenantId }) : this.provisionOrphanProjectResources({ projectId });
    this.resourcePending.set(projectId, task);
    try { await task; } finally { this.resourcePending.delete(projectId); }
  }

  isEnabled(): boolean {
    return !!this.proxyUrl && !!this.adminUsername && !!this.adminPassword;
  }

  private budgetFor(defaults: BudgetDefaults, level: 'tenant' | 'project' | KeyType): BifrostBudget {
    switch (level) {
      case 'tenant':
        return { max_limit: defaults.defaultTenantBudget, reset_duration: defaults.defaultTenantBudgetDuration };
      case 'project':
        return { max_limit: defaults.defaultProjectBudget, reset_duration: defaults.defaultProjectBudgetDuration };
      case 'backend':
        return { max_limit: defaults.defaultBackendBudget, reset_duration: defaults.defaultBackendBudgetDuration };
      case 'chat':
        return { max_limit: defaults.defaultChatBudget, reset_duration: defaults.defaultChatBudgetDuration };
    }
  }

  private baseUrl(): string {
    return this.proxyUrl.replace(/\/v1\/?$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl()}${path}`;
    const credentials = Buffer.from(`${this.adminUsername}:${this.adminPassword}`).toString('base64');
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bifrost API ${method} ${path} failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async createTenantCustomer(tenantId: string, tenantName: string, budgets?: BudgetDefaults): Promise<string> {
    const [fresh] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (fresh?.bifrostTenantId) return fresh.bifrostTenantId;

    const resolvedBudgets = budgets ?? (await this.defaultsService.getTenantBudgets(tenantId));
    const payload: CreateCustomerRequest = {
      name: `tenant-${tenantName}`,
      budget: this.budgetFor(resolvedBudgets, 'tenant'),
    };

    const result = await this.request<CreateCustomerResponse>('POST', '/api/governance/customers', payload);

    const customerId = result.customer.id;
    await db
      .update(tenants)
      .set({ bifrostTenantId: customerId })
      .where(and(eq(tenants.id, tenantId), isNull(tenants.bifrostTenantId)));

    this.logger.log(`Created Bifrost customer for tenant ${tenantName}`);
    return customerId;
  }

  async updateCustomerBudget(customerId: string, budget?: BifrostBudget): Promise<void> {
    await this.request('PUT', `/api/governance/customers/${customerId}`, budget ? { budget } : {});
  }

  async getCustomerBudget(customerId: string): Promise<BifrostBudget | null> {
    const data = await this.request<{ customer: { budget?: BifrostBudget } }>(
      'GET',
      `/api/governance/customers/${customerId}`
    );
    return data.customer.budget ?? null;
  }

  async createProjectTeam(projectId: string, budgets: BudgetDefaults, customerId?: string): Promise<string> {
    const payload: CreateTeamRequest = {
      name: `project-${projectId.slice(0, 8)}`,
      ...(customerId ? { customer_id: customerId } : {}),
      budgets: [this.budgetFor(budgets, 'project')],
    };

    const result = await this.request<CreateTeamResponse>('POST', '/api/governance/teams', payload);

    const teamId = result.team.id;
    await db.update(projects).set({ bifrostProjectId: teamId }).where(eq(projects.id, projectId));

    this.logger.log(`Created Bifrost team for project ${projectId}${customerId ? '' : ' (orphan)'}`);
    return teamId;
  }

  async reassignTeamCustomer(teamId: string, customerId: string): Promise<void> {
    await this.request('PUT', `/api/governance/teams/${teamId}`, {
      customer_id: customerId,
    });
  }

  async getTeamCustomerId(teamId: string): Promise<string | null> {
    const data = await this.request<{ team: { customer_id?: string | null } }>(
      'GET',
      `/api/governance/teams/${teamId}`
    );
    return data.team.customer_id ?? null;
  }

  async updateTeamBudget(teamId: string, budget?: BifrostBudget): Promise<void> {
    await this.request('PUT', `/api/governance/teams/${teamId}`, budget ? { budgets: [budget] } : {});
  }

  async updateProjectResourceBudgets(projectId: string, teamId: string, budgets: BudgetDefaults): Promise<void> {
    const keys = await db
      .select({
        keyType: projectVirtualKeys.keyType,
        bifrostKeyId: projectVirtualKeys.bifrostKeyId,
      })
      .from(projectVirtualKeys)
      .where(and(eq(projectVirtualKeys.projectId, projectId), eq(projectVirtualKeys.status, 'active')));

    const chatKey = keys.find((key) => key.keyType === 'chat');
    const backendKey = keys.find((key) => key.keyType === 'backend');
    if (!chatKey || !backendKey) throw new Error(`Project ${projectId} is missing active Bifrost keys`);

    await Promise.all([
      this.updateTeamBudget(teamId, this.budgetFor(budgets, 'project')),
      this.updateVirtualKey(chatKey.bifrostKeyId, teamId, this.budgetFor(budgets, 'chat')),
      this.updateVirtualKey(backendKey.bifrostKeyId, teamId, this.budgetFor(budgets, 'backend')),
    ]);
  }

  private async updateVirtualKey(keyId: string, teamId: string | null, budget?: BifrostBudget): Promise<void> {
    await this.request('PUT', `/api/governance/virtual-keys/${keyId}`, {
      ...(budget ? { budgets: [budget] } : {}),
      ...(teamId ? { team_id: teamId } : {}),
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.request('DELETE', `/api/governance/teams/${teamId}`);
  }

  async destroyTeamAndKeys(teamId: string | null, bifrostKeyIds: string[]): Promise<void> {
    const errors: string[] = [];
    await Promise.allSettled(
      bifrostKeyIds.map(async (keyId) => {
        try {
          await this.request('DELETE', `/api/governance/virtual-keys/${keyId}`);
        } catch (err) {
          if (!this.isNotFoundError(err as Error)) {
            const message = `key ${keyId}: ${(err as Error).message}`;
            errors.push(message);
            this.logger.warn(`Failed to delete Bifrost ${message}`);
          }
        }
      })
    );
    if (teamId) {
      try {
        await this.deleteTeam(teamId);
      } catch (err) {
        if (!this.isNotFoundError(err as Error)) {
          const message = `team ${teamId}: ${(err as Error).message}`;
          errors.push(message);
          this.logger.warn(`Failed to delete Bifrost ${message}`);
        }
      }
    }
    if (errors.length > 0) {
      throw new Error(`Bifrost teardown incomplete: ${errors.join('; ')}`);
    }
  }

  private isNotFoundError(err: Error): boolean {
    return err.message.includes('(404)');
  }

  async hasKeyedOpenAiProvider(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const data = await this.request<{ keys?: Array<{ value?: { value?: string }; enabled?: boolean }> }>(
        'GET',
        '/api/providers/openai/keys'
      );
      return (data.keys ?? []).some((key) => key.enabled !== false && (key.value?.value ?? '') !== '');
    } catch (err) {
      if (err instanceof Error && this.isNotFoundError(err)) return false;
      throw err;
    }
  }

  async getTeamBudget(teamId: string): Promise<BifrostBudget | null> {
    const data = await this.request<{ team: { budgets?: BifrostBudget[] } }>('GET', `/api/governance/teams/${teamId}`);
    return data.team.budgets?.[0] ?? null;
  }

  async createProjectKey(
    projectId: string,
    tenantId: string | null,
    budgets: BudgetDefaults,
    keyType: KeyType = 'chat',
    teamId?: string
  ): Promise<{ keyId: string; keyToken: string }> {
    const [existing] = await db
      .select()
      .from(projectVirtualKeys)
      .where(
        and(
          eq(projectVirtualKeys.projectId, projectId),
          eq(projectVirtualKeys.keyType, keyType),
          eq(projectVirtualKeys.status, 'active')
        )
      );

    const models = await this.getModels();
    if (!models.length) throw new Error('Bifrost 尚无可用聊天模型，请配置渠道 Key 和模型。');
    const grants = providerGrants(models).map(p => keyType === 'backend' ? { ...p, allowed_models: ['*'] } : p);
    if (existing) {
      const signature = JSON.stringify(grants);
      if (this.grantsApplied.get(existing.bifrostKeyId) !== signature) {
        await this.request('PUT', `/api/governance/virtual-keys/${existing.bifrostKeyId}`, { provider_configs: grants });
        this.grantsApplied.set(existing.bifrostKeyId, signature);
      }
      return { keyId: existing.bifrostKeyId, keyToken: existing.bifrostKeyToken };
    }

    const payload: CreateVirtualKeyRequest = {
      name: `project-${projectId.slice(0, 8)}-${keyType}`,
      description: `Virtual key (${keyType}) for project ${projectId}${tenantId ? ` (tenant: ${tenantId})` : ' (pool)'}`,
      provider_configs: grants,
      budgets: [this.budgetFor(budgets, keyType)],
      ...(teamId ? { team_id: teamId } : {}),
    };

    const result = await this.request<CreateVirtualKeyResponse>('POST', '/api/governance/virtual-keys', payload);

    const keyId = result.virtual_key.id;
    const keyToken = result.virtual_key.value;

    await db.insert(projectVirtualKeys).values({
      id: crypto.randomUUID(),
      projectId,
      tenantId,
      keyType,
      bifrostKeyId: keyId,
      bifrostKeyToken: keyToken,
      status: 'active',
    });

    this.logger.log(`Created Bifrost virtual key (${keyType}) for project ${projectId}`);
    return { keyId, keyToken };
  }

  private async ensureProjectTeam(projectId: string, budgets: BudgetDefaults, customerId?: string): Promise<string> {
    const [project] = await db
      .select({ teamId: projects.bifrostProjectId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (project?.teamId) return project.teamId;

    return this.createProjectTeam(projectId, budgets, customerId);
  }

  private async provisionProjectResources(params: { projectId: string; tenantId: string }): Promise<void> {
    const { projectId, tenantId } = params;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return;

    const budgets = await this.defaultsService.getTenantBudgets(tenantId);
    const customerId = tenant.bifrostTenantId ?? (await this.createTenantCustomer(tenantId, tenant.name, budgets));

    const teamId = await this.ensureProjectTeam(projectId, budgets, customerId);

    await Promise.all([
      this.createProjectKey(projectId, tenantId, budgets, 'chat', teamId),
      this.createProjectKey(projectId, tenantId, budgets, 'backend', teamId),
    ]);
  }

  private async provisionOrphanProjectResources(params: { projectId: string }): Promise<void> {
    const { projectId } = params;

    const budgets = await this.defaultsService.getGlobalBudgets();
    const teamId = await this.ensureProjectTeam(projectId, budgets);

    await Promise.all([
      this.createProjectKey(projectId, null, budgets, 'chat', teamId),
      this.createProjectKey(projectId, null, budgets, 'backend', teamId),
    ]);
  }

  async getEnvironmentPodOptions(
    projectEnvironmentId: string
  ): Promise<{ bifrostApiKey: string; bifrostBackendApiKey?: string; bifrostProxyUrl: string; agentModelConfig: string } | null> {
    if (!this.isEnabled()) return null;
    const [env] = await db
      .select({ projectId: projectEnvironments.projectId })
      .from(projectEnvironments)
      .where(eq(projectEnvironments.id, projectEnvironmentId));
    if (!env) return null;
    const [project] = await db.select({ tenantId: projects.tenantId }).from(projects).where(eq(projects.id, env.projectId));
    if (!project) return null;
    await this.ensureResources(env.projectId, project.tenantId);

    const keys = await db
      .select()
      .from(projectVirtualKeys)
      .where(and(eq(projectVirtualKeys.projectId, env.projectId), eq(projectVirtualKeys.status, 'active')));

    const pick = (keyType: KeyType) =>
      keys.find((k) => k.keyType === keyType && k.projectEnvironmentId === projectEnvironmentId) ??
      keys.find((k) => k.keyType === keyType);

    const chatKey = pick('chat');
    const backendKey = pick('backend');
    if (!chatKey || !backendKey) return null;

    return {
      bifrostApiKey: chatKey.bifrostKeyToken,
      bifrostBackendApiKey: backendKey.bifrostKeyToken,
      bifrostProxyUrl: this.podProxyUrl,
      agentModelConfig: JSON.stringify(await this.modelConfig()),
    };
  }

  async getProjectChatKeyToken(projectId: string, projectEnvironmentId?: string): Promise<string | null> {
    const keys = await db
      .select()
      .from(projectVirtualKeys)
      .where(
        and(
          eq(projectVirtualKeys.projectId, projectId),
          eq(projectVirtualKeys.keyType, 'chat'),
          eq(projectVirtualKeys.status, 'active')
        )
      );

    const environmentKey = projectEnvironmentId
      ? keys.find((k) => k.projectEnvironmentId === projectEnvironmentId)
      : undefined;
    const projectKey = keys.find((k) => k.projectEnvironmentId === null);
    const key = environmentKey ?? projectKey ?? keys[0];
    return key?.bifrostKeyToken ?? null;
  }

  async getProjectKeyBudgets(projectId: string): Promise<Array<{ keyType: KeyType; budget: BifrostBudget | null }>> {
    const keys = await db
      .select()
      .from(projectVirtualKeys)
      .where(and(eq(projectVirtualKeys.projectId, projectId), eq(projectVirtualKeys.status, 'active')));

    return Promise.all(
      keys.map(async (k) => {
        const data = await this.request<{ virtual_key: { budgets?: BifrostBudget[] } }>(
          'GET',
          `/api/governance/virtual-keys/${k.bifrostKeyId}`
        );
        const budget = data.virtual_key.budgets?.[0] ?? null;
        return { keyType: k.keyType as KeyType, budget };
      })
    );
  }

  async updateKeyBudget(projectId: string, keyType: KeyType, maxBudget: number, budgetDuration: string): Promise<void> {
    const [key] = await db
      .select()
      .from(projectVirtualKeys)
      .where(
        and(
          eq(projectVirtualKeys.projectId, projectId),
          eq(projectVirtualKeys.keyType, keyType),
          eq(projectVirtualKeys.status, 'active')
        )
      );

    if (!key) throw new Error(`No active ${keyType} key for project ${projectId}`);

    const [project] = await db
      .select({ teamId: projects.bifrostProjectId })
      .from(projects)
      .where(eq(projects.id, projectId));

    const budget: BifrostBudget | undefined =
      maxBudget > 0 ? { max_limit: maxBudget, reset_duration: budgetDuration } : undefined;

    await this.updateVirtualKey(key.bifrostKeyId, project?.teamId ?? null, budget);

    this.logger.log(`Updated budget for ${keyType} key of project ${projectId}: $${maxBudget}/${budgetDuration}`);
  }

  async revokeProjectKeys(projectId: string): Promise<void> {
    const activeKeys = await db
      .select()
      .from(projectVirtualKeys)
      .where(and(eq(projectVirtualKeys.projectId, projectId), eq(projectVirtualKeys.status, 'active')));

    await Promise.allSettled(
      activeKeys.map(async (key) => {
        try {
          await this.request<DeleteVirtualKeyResponse>('DELETE', `/api/governance/virtual-keys/${key.bifrostKeyId}`);
        } catch (err) {
          this.logger.warn(`Failed to delete Bifrost key ${key.bifrostKeyId}: ${(err as Error).message}`);
        }
        await db
          .update(projectVirtualKeys)
          .set({ status: 'revoked', updatedAt: new Date() })
          .where(eq(projectVirtualKeys.id, key.id));
      })
    );

    if (activeKeys.length > 0) {
      this.logger.log(`Revoked ${activeKeys.length} Bifrost virtual key(s) for project ${projectId}`);
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (project?.bifrostProjectId) {
      try {
        await this.deleteTeam(project.bifrostProjectId);
        await db.update(projects).set({ bifrostProjectId: null }).where(eq(projects.id, projectId));
      } catch (err) {
        this.logger.warn(`Failed to delete Bifrost team for project ${projectId}: ${(err as Error).message}`);
      }
    }
  }

  async revokeEnvironmentKeys(projectEnvironmentId: string): Promise<void> {
    const activeKeys = await db
      .select()
      .from(projectVirtualKeys)
      .where(
        and(eq(projectVirtualKeys.projectEnvironmentId, projectEnvironmentId), eq(projectVirtualKeys.status, 'active'))
      );

    await Promise.allSettled(
      activeKeys.map(async (key) => {
        try {
          await this.request<DeleteVirtualKeyResponse>('DELETE', `/api/governance/virtual-keys/${key.bifrostKeyId}`);
        } catch (err) {
          this.logger.warn(`Failed to delete Bifrost key ${key.bifrostKeyId}: ${(err as Error).message}`);
        }
        await db
          .update(projectVirtualKeys)
          .set({ status: 'revoked', updatedAt: new Date() })
          .where(eq(projectVirtualKeys.id, key.id));
      })
    );

    if (activeKeys.length > 0) {
      this.logger.log(`Revoked ${activeKeys.length} Bifrost virtual key(s) for environment ${projectEnvironmentId}`);
    }
  }
}
