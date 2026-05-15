import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as k8s from "@kubernetes/client-node";
import { loadKubeConfig } from "../common/k8s-client";
import { ProjectAuthOidcConfig } from "./project.types";

const TRAEFIK_GROUP = "traefik.io";
const TRAEFIK_VERSION = "v1alpha1";
const MIDDLEWARES_PLURAL = "middlewares";
const INGRESSROUTES_PLURAL = "ingressroutes";

const middlewareName = (projectId: string) =>
  `opsiforce-project-${projectId}-oidc`;
const ingressRouteName = (projectId: string) =>
  `opsiforce-project-${projectId}`;

interface TraefikOidcAssertClaim {
  Name: string;
  AnyOf?: string[];
  AllOf?: string[];
}

interface TraefikOidcPluginSpec {
  LogLevel?: string;
  Secret: string;
  Provider: {
    Url: string;
    ClientId: string;
    ClientSecret: string;
    UsePkce: boolean;
    ValidateAudience: boolean;
    ValidateIssuer: boolean;
    TokenValidation: string;
  };
  CallbackUri: string;
  Scopes?: string[];
  Authorization?: { AssertClaims: TraefikOidcAssertClaim[] };
  SessionCookie?: { Secure: boolean };
  Headers?: Array<{ Name: string; Value: string }>;
  BypassAuthenticationRule?: string;
}

interface MiddlewareExtras {
  headers?: Array<{ Name: string; Value: string }>;
  assertClaims?: TraefikOidcAssertClaim[];
  bypassAuthPaths?: string[];
  tokenValidation?: "IdToken" | "AccessToken" | "Introspection";
}

const MANUAL_HEADERS: Array<{ Name: string; Value: string }> = [
  { Name: "X-Oidc-Subject", Value: "{{ .claims.sub }}" },
  { Name: "X-Oidc-Email", Value: "{{ .claims.email }}" },
];

function bypassRuleFromPaths(paths: string[] | undefined): string | undefined {
  if (!paths) return undefined;
  const safe = paths
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/'/g, ""));
  if (safe.length === 0) return undefined;
  return safe.map((p) => `PathPrefix('${p}')`).join(" || ");
}

function pathsFromBypassRule(rule: string | undefined): string[] {
  if (!rule) return [];
  const matches = rule.match(/PathPrefix\('([^']*)'\)/g);
  if (!matches) return [];
  return matches
    .map((m) => m.slice("PathPrefix('".length, -2))
    .filter((p) => p.length > 0);
}

@Injectable()
export class ProjectAuthService {
  private readonly logger = new Logger(ProjectAuthService.name);
  private readonly customApi: k8s.CustomObjectsApi;
  private readonly namespace: string;
  private readonly appsHostname: string;
  private readonly webappServiceName: string;
  private readonly webappServicePort: number;
  private readonly pluginSecret: string;
  private readonly makaraClientId: string;
  private readonly makaraClientSecret: string;
  private readonly makaraIssuerUrl: string;

  constructor(private readonly configService: ConfigService) {
    const kc = loadKubeConfig();
    this.customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    this.namespace = this.configService.getOrThrow<string>("k8sNamespace");
    this.appsHostname = this.configService.getOrThrow<string>("appsHostname");
    this.webappServiceName =
      this.configService.getOrThrow<string>("webappServiceName");
    this.webappServicePort =
      this.configService.getOrThrow<number>("webappServicePort");
    this.pluginSecret =
      this.configService.getOrThrow<string>("oidcPluginSecret");
    this.makaraClientId =
      this.configService.getOrThrow<string>("makaraOidcClientId");
    this.makaraClientSecret =
      this.configService.get<string>("makaraOidcClientSecret") ?? "";
    this.makaraIssuerUrl = this.configService.getOrThrow<string>(
      "makaraOidcIssuerUrl",
    );
  }

  private projectHost(projectId: string): string {
    return `${projectId}.${this.appsHostname}`;
  }

  private buildMiddleware(
    projectId: string,
    config: ProjectAuthOidcConfig,
    extras: MiddlewareExtras = {},
  ) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error("clientId and clientSecret are required");
    }
    const providerUrl =
      config.discoveryUrl?.replace(
        /\/\.well-known\/openid-configuration\/?$/,
        "",
      ) ?? "";
    if (!providerUrl) {
      throw new Error("discoveryUrl is required");
    }

    const provider: TraefikOidcPluginSpec["Provider"] = {
      Url: providerUrl,
      ClientId: config.clientId,
      ClientSecret: config.clientSecret,
      UsePkce: true,
      ValidateAudience: true,
      ValidateIssuer: true,
      TokenValidation: extras.tokenValidation ?? "IdToken",
    };

    const plugin: TraefikOidcPluginSpec = {
      LogLevel: "DEBUG",
      Secret: this.pluginSecret,
      Provider: provider,
      CallbackUri: `https://${this.projectHost(projectId)}/oidc/callback`,
      Scopes: (config.scope ?? "openid profile email")
        .split(/\s+/)
        .filter(Boolean),
      SessionCookie: { Secure: true },
    };

    if (extras.headers && extras.headers.length > 0) {
      plugin.Headers = extras.headers;
    }

    if (extras.assertClaims && extras.assertClaims.length > 0) {
      plugin.Authorization = { AssertClaims: extras.assertClaims };
    }

    const bypassRule = bypassRuleFromPaths(extras.bypassAuthPaths);
    if (bypassRule) {
      plugin.BypassAuthenticationRule = bypassRule;
    }

    return {
      apiVersion: `${TRAEFIK_GROUP}/${TRAEFIK_VERSION}`,
      kind: "Middleware",
      metadata: { name: middlewareName(projectId), namespace: this.namespace },
      spec: { plugin: { "traefik-oidc-auth": plugin } },
    };
  }

  private keycloakExtras(
    tenantName: string,
    clientId: string,
  ): MiddlewareExtras {
    return {
      headers: [
        { Name: "X-Oidc-Username", Value: "{{ .claims.preferred_username }}" },
        { Name: "X-Oidc-Subject", Value: "{{ .claims.sub }}" },
        { Name: "X-Oidc-Email", Value: "{{ .claims.preferred_username }}" },
        {
          Name: "X-Oidc-Realm-Roles",
          Value: '{{ index .claims "realm_access" "roles" | mapToJsonArray }}',
        },
        {
          Name: "X-Oidc-Client-Roles",
          Value: `{{ index .claims "resource_access" "${clientId}" "roles" | mapToJsonArray }}`,
        },
      ],
      assertClaims: [
        {
          Name: "realm_access.roles[*]",
          AnyOf: [`makara_tenant_name_${tenantName}`],
        },
      ],
    };
  }

  private buildIngressRoute(
    projectId: string,
    middlewares: Array<{ name: string; namespace: string }>,
  ) {
    const serviceRef: {
      name: string;
      namespace: string;
      port: number;
    } = {
      name: this.webappServiceName,
      namespace: this.namespace,
      port: this.webappServicePort,
    };

    return {
      apiVersion: `${TRAEFIK_GROUP}/${TRAEFIK_VERSION}`,
      kind: "IngressRoute",
      metadata: {
        name: ingressRouteName(projectId),
        namespace: this.namespace,
      },
      spec: {
        entryPoints: ["websecure"],
        routes: [
          {
            kind: "Rule",
            match: `Host(\`${this.projectHost(projectId)}\`)`,
            priority: 100,
            middlewares,
            services: [serviceRef],
          },
        ],
      },
    };
  }

  private oidcMiddlewareRef(projectId: string) {
    return { name: middlewareName(projectId), namespace: this.namespace };
  }

  async getConfig(
    projectId: string,
  ): Promise<{ config?: ProjectAuthOidcConfig; bypassAuthPaths: string[] }> {
    const plugin = await this.readPluginSpec(projectId);
    if (!plugin) return { bypassAuthPaths: [] };
    return {
      config: {
        clientId: plugin.Provider.ClientId,
        discoveryUrl: plugin.Provider.Url
          ? `${plugin.Provider.Url}/.well-known/openid-configuration`
          : undefined,
        scope: plugin.Scopes?.join(" "),
      },
      bypassAuthPaths: pathsFromBypassRule(plugin.BypassAuthenticationRule),
    };
  }

  private async readPluginSpec(
    projectId: string,
  ): Promise<TraefikOidcPluginSpec | undefined> {
    try {
      const resp = await this.customApi.getNamespacedCustomObject({
        group: TRAEFIK_GROUP,
        version: TRAEFIK_VERSION,
        namespace: this.namespace,
        plural: MIDDLEWARES_PLURAL,
        name: middlewareName(projectId),
      });
      return (
        resp as { spec?: { plugin?: Record<string, TraefikOidcPluginSpec> } }
      )?.spec?.plugin?.["traefik-oidc-auth"];
    } catch (err) {
      const status = (err as { code?: number })?.code;
      if (status === 404) return undefined;
      this.logger.error(
        `Failed to read middleware for project ${projectId}`,
        err,
      );
      throw err;
    }
  }

  async apply(
    projectId: string,
    config: ProjectAuthOidcConfig,
    bypassAuthPaths?: string[],
  ): Promise<void> {
    const effectiveConfig = await this.preserveClientSecret(projectId, config);
    const extras: MiddlewareExtras = {
      headers: MANUAL_HEADERS,
      bypassAuthPaths,
    };
    const mw = this.buildMiddleware(projectId, effectiveConfig, extras);
    const ir = this.buildIngressRoute(projectId, [
      this.oidcMiddlewareRef(projectId),
    ]);
    await this.upsert(MIDDLEWARES_PLURAL, mw.metadata.name, mw);
    await this.upsert(INGRESSROUTES_PLURAL, ir.metadata.name, ir);
  }

  async applyMakara(
    projectId: string,
    tenantName: string,
    bypassAuthPaths?: string[],
  ): Promise<void> {
    if (!this.makaraClientSecret) {
      throw new Error(
        "MAKARA_OIDC_CLIENT_SECRET is not set — cannot enable Makara auth.",
      );
    }
    const config: ProjectAuthOidcConfig = {
      clientId: this.makaraClientId,
      clientSecret: this.makaraClientSecret,
      discoveryUrl: `${this.makaraIssuerUrl}/.well-known/openid-configuration`,
    };
    const extras: MiddlewareExtras = {
      ...this.keycloakExtras(tenantName, this.makaraClientId),
      tokenValidation: "AccessToken",
      bypassAuthPaths,
    };
    const mw = this.buildMiddleware(projectId, config, extras);
    const middlewares = [this.oidcMiddlewareRef(projectId)];
    const ir = this.buildIngressRoute(projectId, middlewares);
    await this.upsert(MIDDLEWARES_PLURAL, mw.metadata.name, mw);
    await this.upsert(INGRESSROUTES_PLURAL, ir.metadata.name, ir);
  }

  private async preserveClientSecret(
    projectId: string,
    config: ProjectAuthOidcConfig,
  ): Promise<ProjectAuthOidcConfig> {
    if (config.clientSecret?.trim()) return config;
    const existing = await this.readPluginSpec(projectId);
    const preserved = existing?.Provider?.ClientSecret;
    if (!preserved) return config;
    return { ...config, clientSecret: preserved };
  }

  async remove(projectId: string): Promise<void> {
    await this.deleteIfExists(
      INGRESSROUTES_PLURAL,
      ingressRouteName(projectId),
    );
    await this.deleteIfExists(MIDDLEWARES_PLURAL, middlewareName(projectId));
  }

  private async upsert(
    plural: string,
    name: string,
    body: object,
  ): Promise<void> {
    try {
      await this.customApi.createNamespacedCustomObject({
        group: TRAEFIK_GROUP,
        version: TRAEFIK_VERSION,
        namespace: this.namespace,
        plural,
        body,
      });
      return;
    } catch (err) {
      const status = (err as { code?: number })?.code;
      if (status !== 409) throw err;
    }

    const existing = (await this.customApi.getNamespacedCustomObject({
      group: TRAEFIK_GROUP,
      version: TRAEFIK_VERSION,
      namespace: this.namespace,
      plural,
      name,
    })) as { metadata?: { resourceVersion?: string } };

    const resourceVersion = existing.metadata?.resourceVersion;
    const existingMeta =
      (body as { metadata?: Record<string, unknown> }).metadata ?? {};
    const bodyWithVersion = {
      ...body,
      metadata: { ...existingMeta, resourceVersion },
    };

    await this.customApi.replaceNamespacedCustomObject({
      group: TRAEFIK_GROUP,
      version: TRAEFIK_VERSION,
      namespace: this.namespace,
      plural,
      name,
      body: bodyWithVersion,
    });
  }

  private async deleteIfExists(plural: string, name: string): Promise<void> {
    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: TRAEFIK_GROUP,
        version: TRAEFIK_VERSION,
        namespace: this.namespace,
        plural,
        name,
      });
    } catch (err) {
      const status = (err as { code?: number })?.code;
      if (status !== 404) throw err;
    }
  }
}
