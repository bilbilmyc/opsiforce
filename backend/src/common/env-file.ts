import path from "node:path"
import { readFile, rename, rm } from "node:fs/promises"
import { writeJsonAtomic } from "./fs"

export function envFilePath(storageMountPath: string, directory: string): string {
  return path.join(storageMountPath, directory, "app", "opsiforce.env.json")
}

export function envBackupFilePath(storageMountPath: string, directory: string): string {
  return path.join(storageMountPath, directory, "app", "opsiforce.env.backup.json")
}

export async function writeEnvJsonBackup(
  storageMountPath: string,
  directory: string,
  variables: Record<string, string>,
): Promise<void> {
  await writeJsonAtomic(envBackupFilePath(storageMountPath, directory), variables)
}

export async function restoreEnvJsonBackup(storageMountPath: string, directory: string): Promise<void> {
  try {
    await rename(envBackupFilePath(storageMountPath, directory), envFilePath(storageMountPath, directory))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return
    throw err
  }
}

export async function clearEnvJsonBackup(storageMountPath: string, directory: string): Promise<void> {
  await rm(envBackupFilePath(storageMountPath, directory), { force: true })
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
