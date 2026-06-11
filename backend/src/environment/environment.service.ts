import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { and, eq } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { environments, projectEnvironments } from "../../db/schema"
import {
  CreateEnvironmentDto,
  DEVELOPMENT_ENVIRONMENT_NAME,
  EnvironmentResponse,
  EnvironmentRow,
  PRODUCTION_ENVIRONMENT_NAME,
  UpdateEnvironmentDto,
} from "./environment.types"

const RESERVED_ENVIRONMENT_NAMES = [DEVELOPMENT_ENVIRONMENT_NAME, PRODUCTION_ENVIRONMENT_NAME]

const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 60
const DESCRIPTION_MAX_LENGTH = 500

@Injectable()
export class EnvironmentService {
  async listForTenant(tenantId: string): Promise<EnvironmentResponse[]> {
    const rows = await db
      .select()
      .from(environments)
      .where(eq(environments.tenantId, tenantId))
    return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)).map(toResponse)
  }

  async getDefaultForTenant(tenantId: string): Promise<EnvironmentRow | null> {
    const [row] = await db
      .select()
      .from(environments)
      .where(and(eq(environments.tenantId, tenantId), eq(environments.isDefault, true)))
    return row ?? null
  }

  async ensureDefaultForTenant(tenantId: string): Promise<EnvironmentRow> {
    await this.ensureProductionForTenant(tenantId)

    const existing = await this.getDefaultForTenant(tenantId)
    if (existing) return existing

    const [created] = await db
      .insert(environments)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name: DEVELOPMENT_ENVIRONMENT_NAME,
        description: "Default working environment",
        isDefault: true,
        isProtected: true,
      })
      .onConflictDoNothing()
      .returning()

    if (created) return created

    const fallback = await this.getDefaultForTenant(tenantId)
    if (!fallback) throw new Error(`Failed to ensure Development environment for tenant ${tenantId}`)
    return fallback
  }

  private async ensureProductionForTenant(tenantId: string): Promise<void> {
    const rows = await db
      .select({ name: environments.name })
      .from(environments)
      .where(eq(environments.tenantId, tenantId))
    if (rows.some((r) => r.name.toLowerCase() === PRODUCTION_ENVIRONMENT_NAME.toLowerCase())) return

    await db
      .insert(environments)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name: PRODUCTION_ENVIRONMENT_NAME,
        description: "Live environment for published apps",
        isDefault: false,
        isProtected: true,
      })
      .onConflictDoNothing()
  }

  async findForTenant(tenantId: string, id: string): Promise<EnvironmentRow> {
    const [row] = await db
      .select()
      .from(environments)
      .where(and(eq(environments.id, id), eq(environments.tenantId, tenantId)))
    if (!row) throw new NotFoundException(`Environment ${id} not found`)
    return row
  }

  async create(tenantId: string, dto: CreateEnvironmentDto): Promise<EnvironmentResponse> {
    const name = this.validateName(dto.name)
    const description = this.validateDescription(dto.description)

    this.assertNameNotReserved(name)

    await this.assertNameAvailable(tenantId, name, null)

    const [created] = await db
      .insert(environments)
      .values({ id: crypto.randomUUID(), tenantId, name, description, isDefault: false })
      .returning()
    return toResponse(created)
  }

  async update(tenantId: string, id: string, dto: UpdateEnvironmentDto): Promise<EnvironmentResponse> {
    const current = await this.findForTenant(tenantId, id)
    if (current.isProtected) {
      throw new BadRequestException(`The ${current.name} environment is protected and cannot be modified`)
    }

    const patch: Partial<EnvironmentRow> = {}
    if (dto.name !== undefined) {
      const name = this.validateName(dto.name)
      this.assertNameNotReserved(name)
      await this.assertNameAvailable(tenantId, name, id)
      patch.name = name
    }
    if (dto.description !== undefined) patch.description = this.validateDescription(dto.description)

    if (Object.keys(patch).length === 0) return toResponse(current)

    const [updated] = await db
      .update(environments)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(environments.id, id), eq(environments.tenantId, tenantId)))
      .returning()
    return toResponse(updated)
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const current = await this.findForTenant(tenantId, id)
    if (current.isProtected) {
      throw new BadRequestException(`The ${current.name} environment is protected and cannot be deleted`)
    }

    const [instance] = await db
      .select({ id: projectEnvironments.id })
      .from(projectEnvironments)
      .where(eq(projectEnvironments.environmentId, id))
      .limit(1)
    if (instance) {
      throw new BadRequestException(
        "This environment still has published project instances. Delete those project environments first.",
      )
    }

    await db.delete(environments).where(and(eq(environments.id, id), eq(environments.tenantId, tenantId)))
  }

  private assertNameNotReserved(name: string): void {
    const reserved = RESERVED_ENVIRONMENT_NAMES.find((r) => r.toLowerCase() === name.toLowerCase())
    if (reserved) throw new BadRequestException(`'${reserved}' is a reserved environment name`)
  }

  private async assertNameAvailable(tenantId: string, name: string, excludeId: string | null): Promise<void> {
    const rows = await db
      .select({ id: environments.id, name: environments.name })
      .from(environments)
      .where(eq(environments.tenantId, tenantId))
    const clash = rows.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== excludeId)
    if (clash) throw new BadRequestException(`An environment named '${name}' already exists`)
  }

  private validateName(value: unknown): string {
    if (typeof value !== "string") throw new BadRequestException("'name' must be a string")
    const trimmed = value.trim()
    if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
      throw new BadRequestException(`'name' must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters`)
    }
    return trimmed
  }

  private validateDescription(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== "string") throw new BadRequestException("'description' must be a string or null")
    const trimmed = value.trim()
    if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
      throw new BadRequestException(`'description' must be at most ${DESCRIPTION_MAX_LENGTH} characters`)
    }
    return trimmed.length === 0 ? null : trimmed
  }
}

function toResponse(row: EnvironmentRow): EnvironmentResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    isProtected: row.isProtected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
