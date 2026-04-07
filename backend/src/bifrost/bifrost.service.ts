import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { projectApiKeys } from "../../db/schema"
import type {
  KeyType,
  BifrostBudget,
  CreateVirtualKeyRequest,
  CreateVirtualKeyResponse,
  DeleteVirtualKeyResponse,
  BifrostLogStats,
  BifrostCostHistogram,
} from "./bifrost.types"

@Injectable()
export class BifrostService {
  private readonly logger = new Logger(BifrostService.name)
  private readonly proxyUrl: string
  private readonly podProxyUrl: string
  private readonly adminUsername: string
  private readonly adminPassword: string

  constructor(private readonly configService: ConfigService) {
    this.proxyUrl = this.configService.get<string>("bifrostProxyUrl", "")
    this.podProxyUrl = this.configService.get<string>("bifrostPodProxyUrl", "") || this.proxyUrl
    this.adminUsername = this.configService.get<string>("bifrostAdminUsername", "")
    this.adminPassword = this.configService.get<string>("bifrostAdminPassword", "")
  }

  isEnabled(): boolean {
    return !!this.proxyUrl && !!this.adminUsername && !!this.adminPassword
  }

  getPodProxyUrl(): string {
    return this.podProxyUrl
  }

  private baseUrl(): string {
    return this.proxyUrl.replace(/\/v1\/?$/, "")
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl()}${path}`
    const credentials = Buffer.from(`${this.adminUsername}:${this.adminPassword}`).toString("base64")
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bifrost API ${method} ${path} failed (${response.status}): ${text}`)
    }

    return response.json() as Promise<T>
  }

  private static readonly MODEL_ALLOWLISTS: Record<KeyType, string[]> = {
    chat: ["gpt-5.3-codex", "o4-mini", "gpt-5.4-mini", "gpt-4.1"],
    backend: ["gpt-4.1", "gpt-5.4-mini"],
  }

  private static readonly DEFAULT_BUDGETS: Record<KeyType, BifrostBudget> = {
    chat: { max_limit: 5, reset_duration: "1M" },
    backend: { max_limit: 5, reset_duration: "1M" },
  }

  async createProjectKey(projectId: string, tenantId: string, keyType: KeyType = "chat"): Promise<{ keyId: string; keyToken: string }> {
    const [existing] = await db
      .select()
      .from(projectApiKeys)
      .where(and(
        eq(projectApiKeys.projectId, projectId),
        eq(projectApiKeys.keyType, keyType),
        eq(projectApiKeys.status, "active"),
      ))

    if (existing) {
      return { keyId: existing.bifrostKeyId, keyToken: existing.bifrostKeyToken }
    }

    const budget = BifrostService.DEFAULT_BUDGETS[keyType]

    const payload: CreateVirtualKeyRequest = {
      name: `project-${projectId.slice(0, 8)}-${keyType}`,
      description: `Virtual key (${keyType}) for project ${projectId} (tenant: ${tenantId})`,
      provider_configs: [{
        provider: "openai",
        allowed_models: BifrostService.MODEL_ALLOWLISTS[keyType],
      }],
      budget,
    }

    const result = await this.request<CreateVirtualKeyResponse>(
      "POST",
      "/api/governance/virtual-keys",
      payload,
    )

    const keyId = result.virtual_key.id
    const keyToken = result.virtual_key.value

    await db.insert(projectApiKeys).values({
      id: crypto.randomUUID(),
      projectId,
      tenantId,
      keyType,
      bifrostKeyId: keyId,
      bifrostKeyToken: keyToken,
      maxBudget: budget.max_limit,
      budgetDuration: budget.reset_duration,
      status: "active",
    })

    this.logger.log(`Created Bifrost virtual key (${keyType}) for project ${projectId}`)
    return { keyId, keyToken }
  }

  async getProjectBudgets(projectId: string): Promise<Array<{ keyType: KeyType; maxBudget: number | null; budgetDuration: string | null }>> {
    const keys = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    return keys.map((k) => ({
      keyType: k.keyType as KeyType,
      maxBudget: k.maxBudget,
      budgetDuration: k.budgetDuration,
    }))
  }

  async updateKeyBudget(projectId: string, keyType: KeyType, maxBudget: number, budgetDuration: string): Promise<void> {
    const [key] = await db
      .select()
      .from(projectApiKeys)
      .where(and(
        eq(projectApiKeys.projectId, projectId),
        eq(projectApiKeys.keyType, keyType),
        eq(projectApiKeys.status, "active"),
      ))

    if (!key) throw new Error(`No active ${keyType} key for project ${projectId}`)

    const budget: BifrostBudget | undefined = maxBudget > 0
      ? { max_limit: maxBudget, reset_duration: budgetDuration }
      : undefined

    await this.request("PUT", `/api/governance/virtual-keys/${key.bifrostKeyId}`, {
      ...(budget ? { budget } : {}),
    })

    await db
      .update(projectApiKeys)
      .set({
        maxBudget: budget?.max_limit ?? null,
        budgetDuration: budget?.reset_duration ?? null,
        updatedAt: new Date(),
      })
      .where(eq(projectApiKeys.id, key.id))

    this.logger.log(`Updated budget for ${keyType} key of project ${projectId}: $${maxBudget}/${budgetDuration}`)
  }

  async revokeProjectKeys(projectId: string): Promise<void> {
    const activeKeys = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    for (const key of activeKeys) {
      try {
        await this.request<DeleteVirtualKeyResponse>(
          "DELETE",
          `/api/governance/virtual-keys/${key.bifrostKeyId}`,
        )
      } catch (err) {
        this.logger.warn(`Failed to delete Bifrost key ${key.bifrostKeyId}: ${(err as Error).message}`)
      }

      await db
        .update(projectApiKeys)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(projectApiKeys.id, key.id))
    }

    if (activeKeys.length > 0) {
      this.logger.log(`Revoked ${activeKeys.length} Bifrost virtual key(s) for project ${projectId}`)
    }
  }

  async getProjectUsage(projectId: string): Promise<{
    aggregate: BifrostLogStats | null
    byKeyType: Array<{ keyType: KeyType } & BifrostLogStats>
  }> {
    const keys = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    if (keys.length === 0) return { aggregate: null, byKeyType: [] }

    const allKeyIds = keys.map((k) => k.bifrostKeyId).join(",")
    const aggregate = await this.request<BifrostLogStats>(
      "GET",
      `/api/logs/stats?virtual_key_ids=${allKeyIds}`,
    )

    const keysByType: Record<string, typeof keys> = {}
    for (const k of keys) {
      ;(keysByType[k.keyType] ??= []).push(k)
    }

    const byKeyType: Array<{ keyType: KeyType } & BifrostLogStats> = []
    for (const [keyType, typeKeys] of Object.entries(keysByType)) {
      const typeKeyIds = typeKeys.map((k) => k.bifrostKeyId).join(",")
      const stats = await this.request<BifrostLogStats>(
        "GET",
        `/api/logs/stats?virtual_key_ids=${typeKeyIds}`,
      )
      byKeyType.push({ keyType: keyType as KeyType, ...stats })
    }

    return { aggregate, byKeyType }
  }

  async getTenantUsage(tenantId: string): Promise<BifrostLogStats> {
    const keys = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.tenantId, tenantId), eq(projectApiKeys.status, "active")))

    if (keys.length === 0) {
      return { total_requests: 0, total_tokens: 0, total_cost: 0, average_latency: 0, success_rate: 0 }
    }

    const keyIds = keys.map((k) => k.bifrostKeyId).join(",")
    return this.request<BifrostLogStats>(
      "GET",
      `/api/logs/stats?virtual_key_ids=${keyIds}`,
    )
  }

  async getUsageHistogram(
    projectId: string,
    startTime?: string,
    endTime?: string,
    keyType?: KeyType,
  ): Promise<BifrostCostHistogram | null> {
    const conditions = [
      eq(projectApiKeys.projectId, projectId),
      eq(projectApiKeys.status, "active"),
      ...(keyType ? [eq(projectApiKeys.keyType, keyType)] : []),
    ]

    const keys = await db
      .select()
      .from(projectApiKeys)
      .where(and(...conditions))

    if (keys.length === 0) return null

    const params = new URLSearchParams({
      virtual_key_ids: keys.map((k) => k.bifrostKeyId).join(","),
    })
    if (startTime) params.set("start_time", startTime)
    if (endTime) params.set("end_time", endTime)

    return this.request<BifrostCostHistogram>(
      "GET",
      `/api/logs/histogram/cost?${params.toString()}`,
    )
  }
}
