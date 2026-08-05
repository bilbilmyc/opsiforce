import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { environments, externalServiceUsage, projectEnvironments, projects, tenants } from '../../db/schema';
import { environmentLabel } from './environment-label';
import type {
  UsageBucketKey,
  UsageEnvironmentBreakdown,
  UsageOrganization,
  UsageProjectBreakdown,
  UsageView,
} from './external-service-usage.types';

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

interface UsageQueryRow {
  tenantId: string;
  tenantName: string;
  tenantDisplayName: string;
  service: string;
  projectId: string | null;
  projectTitle: string | null;
  projectEnvironmentId: string | null;
  environmentName: string | null;
  isDefault: boolean | null;
  count: number;
}

@Injectable()
export class ExternalServiceUsageService {
  async recordStoredMessages(key: UsageBucketKey, storedMessages: number): Promise<void> {
    if (storedMessages < 1) return;

    await db
      .insert(externalServiceUsage)
      .values({
        id: crypto.randomUUID(),
        tenantId: key.tenantId,
        projectId: key.projectId,
        projectEnvironmentId: key.projectEnvironmentId,
        service: key.service,
        month: currentMonthStart(),
        count: storedMessages,
      })
      .onConflictDoUpdate({
        target: [
          externalServiceUsage.tenantId,
          externalServiceUsage.projectId,
          externalServiceUsage.projectEnvironmentId,
          externalServiceUsage.service,
          externalServiceUsage.month,
        ],
        set: {
          count: sql`${externalServiceUsage.count} + ${storedMessages}`,
          updatedAt: new Date(),
        },
      });
  }

  async view(month: string | undefined, tenantId: string | undefined): Promise<UsageView> {
    const requestedMonth = month ? parseMonth(month) : currentMonth();

    const rows = await db
      .select({
        tenantId: externalServiceUsage.tenantId,
        tenantName: tenants.name,
        tenantDisplayName: tenants.displayName,
        service: externalServiceUsage.service,
        projectId: externalServiceUsage.projectId,
        projectTitle: projects.title,
        projectEnvironmentId: externalServiceUsage.projectEnvironmentId,
        environmentName: environments.name,
        isDefault: projectEnvironments.isDefault,
        count: externalServiceUsage.count,
      })
      .from(externalServiceUsage)
      .innerJoin(tenants, eq(tenants.id, externalServiceUsage.tenantId))
      .leftJoin(projects, eq(projects.id, externalServiceUsage.projectId))
      .leftJoin(projectEnvironments, eq(projectEnvironments.id, externalServiceUsage.projectEnvironmentId))
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(
        and(
          eq(externalServiceUsage.month, monthStart(requestedMonth)),
          tenantId ? eq(externalServiceUsage.tenantId, tenantId) : undefined
        )
      );

    return { month: requestedMonth, organizations: buildOrganizations(rows) };
  }
}

function buildOrganizations(rows: UsageQueryRow[]): UsageOrganization[] {
  const organizations: UsageOrganization[] = [];

  for (const row of rows) {
    const organization = findOrCreate(
      organizations,
      (candidate) => candidate.tenantId === row.tenantId,
      () => ({
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        tenantDisplayName: row.tenantDisplayName,
        count: 0,
        services: [],
      })
    );
    const service = findOrCreate(
      organization.services,
      (candidate) => candidate.service === row.service,
      () => ({ service: row.service, count: 0, projects: [] })
    );
    const project = findOrCreate(
      service.projects,
      (candidate) => candidate.projectId === row.projectId,
      () => ({
        projectId: row.projectId,
        projectTitle: row.projectTitle,
        deleted: row.projectId === null,
        count: 0,
        environments: [],
      })
    );
    const environment = findOrCreate(
      project.environments,
      (candidate) => candidate.projectEnvironmentId === row.projectEnvironmentId,
      () => ({
        projectEnvironmentId: row.projectEnvironmentId,
        environmentName:
          row.projectEnvironmentId === null ? null : environmentLabel(row.environmentName, row.isDefault ?? false),
        isDefault: row.isDefault ?? false,
        deleted: row.projectEnvironmentId === null,
        count: 0,
      })
    );

    organization.count += row.count;
    service.count += row.count;
    project.count += row.count;
    environment.count += row.count;
  }

  return sortOrganizations(organizations);
}

function sortOrganizations(organizations: UsageOrganization[]): UsageOrganization[] {
  for (const organization of organizations) {
    for (const service of organization.services) {
      for (const project of service.projects) {
        project.environments.sort(compareEnvironments);
      }
      service.projects.sort(compareProjects);
    }
    organization.services.sort(byCountThen((a, b) => a.service.localeCompare(b.service)));
  }

  return organizations.toSorted(byCountThen((a, b) => a.tenantDisplayName.localeCompare(b.tenantDisplayName)));
}

function compareProjects(a: UsageProjectBreakdown, b: UsageProjectBreakdown): number {
  if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
  return byCountThen<UsageProjectBreakdown>((first, second) =>
    (first.projectTitle ?? '').localeCompare(second.projectTitle ?? '')
  )(a, b);
}

function compareEnvironments(a: UsageEnvironmentBreakdown, b: UsageEnvironmentBreakdown): number {
  if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return byCountThen<UsageEnvironmentBreakdown>((first, second) =>
    (first.environmentName ?? '').localeCompare(second.environmentName ?? '')
  )(a, b);
}

function byCountThen<T extends { count: number }>(tiebreak: (a: T, b: T) => number): (a: T, b: T) => number {
  return (a, b) => (b.count === a.count ? tiebreak(a, b) : b.count - a.count);
}

function findOrCreate<T>(list: T[], match: (item: T) => boolean, create: () => T): T {
  const existing = list.find(match);
  if (existing) return existing;

  const created = create();
  list.push(created);
  return created;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function currentMonthStart(): string {
  return monthStart(currentMonth());
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function parseMonth(month: string): string {
  if (!MONTH_PATTERN.test(month)) {
    throw new BadRequestException(`Invalid month "${month}", expected YYYY-MM`);
  }
  return month;
}
