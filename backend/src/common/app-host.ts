export function appHostLabel(routingId: string, slug: string | null | undefined): string {
  return slug ? `${routingId}-${slug}` : routingId;
}

export function appCanonicalHost(routingId: string, slug: string | null | undefined, appsHostname: string): string {
  return `${appHostLabel(routingId, slug)}.${appsHostname}`;
}

export function appPublicUrl(routingId: string, slug: string | null | undefined, appsHostname: string): string {
  return `${process.env.APP_PUBLIC_SCHEME === 'http' ? 'http' : 'https'}://${appCanonicalHost(routingId, slug, appsHostname)}/`;
}
