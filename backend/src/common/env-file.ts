import path from "node:path"
import { readFile } from "node:fs/promises"
import { writeJsonAtomic } from "./fs"

export function envFilePath(storageMountPath: string, directory: string): string {
  return path.join(storageMountPath, directory, "app", "opsiforce.env.json")
}

export async function readEnvJson(storageMountPath: string, directory: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(envFilePath(storageMountPath, directory), "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") result[key] = value
      else if (value !== null && value !== undefined) result[key] = String(value)
    }
    return result
  } catch {
    return {}
  }
}

export async function writeEnvJson(
  storageMountPath: string,
  directory: string,
  variables: Record<string, string>,
): Promise<void> {
  await writeJsonAtomic(envFilePath(storageMountPath, directory), variables)
}
