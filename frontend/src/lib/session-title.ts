const DEFAULT_SESSION_TITLE_RE =
  /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export function isDefaultSessionTitle(title: string | null | undefined): boolean {
  if (!title) return true
  return DEFAULT_SESSION_TITLE_RE.test(title.trim())
}

export function isMeaningfulSessionTitle(title: string | null | undefined): title is string {
  return !isDefaultSessionTitle(title)
}
