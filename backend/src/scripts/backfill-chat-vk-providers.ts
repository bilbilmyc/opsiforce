import { BIFROST_PROVIDER_CONFIGS } from "../bifrost/bifrost.providers"
import type { BifrostProviderConfig } from "../bifrost/bifrost.types"

interface LiveVirtualKey {
  id: string
  name: string
  team_id?: string | null
  budget_id?: string | null
  is_active?: boolean
  description?: string
  value?: string
  provider_configs?: Array<BifrostProviderConfig & { id?: number; virtual_key_id?: string }>
  mcp_configs?: unknown[]
  [key: string]: unknown
}

interface ListVirtualKeysResponse {
  virtual_keys: LiveVirtualKey[]
  total_count?: number
  count?: number
}

const SERVER_SIDE_FIELDS = ["config_hash", "created_at", "updated_at", "team", "budget", "customer"] as const

async function main() {
  const proxyUrl = process.env.BIFROST_PROXY_URL ?? ""
  const adminUsername = process.env.BIFROST_ADMIN_USERNAME ?? ""
  const adminPassword = process.env.BIFROST_ADMIN_PASSWORD ?? ""

  if (!proxyUrl || !adminUsername || !adminPassword) {
    throw new Error(
      "Missing Bifrost env vars (BIFROST_PROXY_URL, BIFROST_ADMIN_USERNAME, BIFROST_ADMIN_PASSWORD)",
    )
  }

  const baseUrl = proxyUrl.replace(/\/v1\/?$/, "")
  const credentials = Buffer.from(`${adminUsername}:${adminPassword}`).toString("base64")
  const authHeader = `Basic ${credentials}`

  const target: BifrostProviderConfig[] = BIFROST_PROVIDER_CONFIGS.chat.map(({ provider, weight }) => ({
    provider,
    weight,
  }))

  console.log("Target chat provider_configs:")
  for (const pc of target) {
    console.log(`  - ${pc.provider.padEnd(20)} weight=${pc.weight}`)
  }
  console.log("")

  const listResponse = await fetch(`${baseUrl}/api/governance/virtual-keys?limit=1000`, {
    headers: { Authorization: authHeader },
  })
  if (!listResponse.ok) {
    throw new Error(`Failed to list virtual keys (${listResponse.status}): ${await listResponse.text()}`)
  }
  const { virtual_keys } = (await listResponse.json()) as ListVirtualKeysResponse

  const chatKeys = virtual_keys.filter(vk => vk.name.endsWith("-chat"))
  console.log(`Found ${virtual_keys.length} total virtual keys, ${chatKeys.length} with -chat suffix.`)
  console.log("")

  let updated = 0
  let unchanged = 0
  let failed = 0

  for (const vk of chatKeys) {
    const current = (vk.provider_configs ?? []).map(pc => `${pc.provider}:${pc.weight ?? "-"}`).join(", ")
    const targetDescription = target.map(pc => `${pc.provider}:${pc.weight}`).join(", ")

    if (matches(vk.provider_configs ?? [], target)) {
      console.log(`[=] ${vk.name} (${vk.id}) already matches target, skipping.`)
      unchanged++
      continue
    }

    console.log(`[~] ${vk.name} (${vk.id})`)
    console.log(`    current: ${current}`)
    console.log(`    target:  ${targetDescription}`)

    const payload = stripServerFields({ ...vk, provider_configs: target })

    const putResponse = await fetch(`${baseUrl}/api/governance/virtual-keys/${vk.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    })

    if (!putResponse.ok) {
      failed++
      console.error(`    FAILED (${putResponse.status}): ${await putResponse.text()}`)
      continue
    }

    updated++
    console.log(`    updated.`)
  }

  console.log("")
  console.log(`Summary: updated=${updated}, unchanged=${unchanged}, failed=${failed}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

function matches(current: BifrostProviderConfig[], target: BifrostProviderConfig[]): boolean {
  if (current.length !== target.length) return false
  const currentByProvider = new Map(current.map(pc => [pc.provider, pc.weight ?? null]))
  return target.every(pc => currentByProvider.get(pc.provider) === pc.weight)
}

function stripServerFields(vk: LiveVirtualKey): LiveVirtualKey {
  const cleaned: LiveVirtualKey = { ...vk }
  for (const field of SERVER_SIDE_FIELDS) {
    delete cleaned[field]
  }
  cleaned.provider_configs = (cleaned.provider_configs ?? []).map(pc => {
    const { id: _id, virtual_key_id: _vkid, ...rest } = pc
    return rest as BifrostProviderConfig
  })
  return cleaned
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
