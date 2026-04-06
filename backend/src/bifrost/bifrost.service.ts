import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { projectApiKeys } from "../../db/schema"
import type {
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
  private readonly masterKey: string

  constructor(private readonly configService: ConfigService) {
    this.proxyUrl = this.configService.get<string>("bifrostProxyUrl", "")
    this.podProxyUrl = this.configService.get<string>("bifrostPodProxyUrl", "") || this.proxyUrl
    this.masterKey = this.configService.get<string>("bifrostMasterKey", "")
  }

  isEnabled(): boolean {
    return !!this.proxyUrl && !!this.masterKey
  }

  getPodProxyUrl(): string {
    return this.podProxyUrl
  }

  private baseUrl(): string {
    return this.proxyUrl.replace(/\/v1\/?$/, "")
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl()}${path}`
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.masterKey}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bifrost API ${method} ${path} failed (${response.status}): ${text}`)
    }

    return response.json() as Promise<T>
  }

  async createProjectKey(projectId: string, tenantId: string): Promise<{ keyId: string; keyToken: string }> {
    const [existing] = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    if (existing) {
      return { keyId: existing.bifrostKeyId, keyToken: existing.bifrostKeyToken }
    }

    const payload: CreateVirtualKeyRequest = {
      name: `project-${projectId.slice(0, 8)}`,
      description: `Virtual key for project ${projectId} (tenant: ${tenantId})`,
      provider_configs: [
        {
          provider: "openai",
          allowed_models: ["gpt-5.3-codex", "o4-mini", "gpt-5.4-mini", "gpt-4.1"],
        },
      ],
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
      bifrostKeyId: keyId,
      bifrostKeyToken: keyToken,
      status: "active",
    })

    this.logger.log(`Created Bifrost virtual key for project ${projectId}`)
    return { keyId, keyToken }
  }

  async revokeProjectKey(projectId: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    if (!existing) return

    try {
      await this.request<DeleteVirtualKeyResponse>(
        "DELETE",
        `/api/governance/virtual-keys/${existing.bifrostKeyId}`,
      )
    } catch (err) {
      this.logger.warn(`Failed to delete Bifrost key ${existing.bifrostKeyId}: ${(err as Error).message}`)
    }

    await db
      .update(projectApiKeys)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(projectApiKeys.id, existing.id))

    this.logger.log(`Revoked Bifrost virtual key for project ${projectId}`)
  }

  async getProjectUsage(projectId: string): Promise<BifrostLogStats | null> {
    const [key] = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    if (!key) return null

    return this.request<BifrostLogStats>(
      "GET",
      `/api/logs/stats?virtual_key_ids=${key.bifrostKeyId}`,
    )
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
  ): Promise<BifrostCostHistogram | null> {
    const [key] = await db
      .select()
      .from(projectApiKeys)
      .where(and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.status, "active")))

    if (!key) return null

    const params = new URLSearchParams({ virtual_key_ids: key.bifrostKeyId })
    if (startTime) params.set("start_time", startTime)
    if (endTime) params.set("end_time", endTime)

    return this.request<BifrostCostHistogram>(
      "GET",
      `/api/logs/histogram/cost?${params.toString()}`,
    )
  }
}
