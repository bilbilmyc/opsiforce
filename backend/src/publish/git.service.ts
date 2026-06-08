import { Injectable, Logger } from "@nestjs/common"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)

const BASE_CONFIG = ["-c", "safe.directory=*", "-c", "core.hooksPath=/dev/null"]
const COMMITTER = ["-c", "user.email=publish@opsiforce.local", "-c", "user.name=OpsiForce Publish"]

@Injectable()
export class GitService {
  private readonly logger = new Logger(GitService.name)

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await run("git", [...BASE_CONFIG, ...args], { cwd, maxBuffer: 32 * 1024 * 1024 })
    return stdout.trim()
  }

  async currentSha(dir: string): Promise<string> {
    return this.git(dir, ["rev-parse", "HEAD"])
  }

  /** Commit the working tree on `main`. Returns the resulting HEAD sha. No-op commit when nothing changed. */
  async commitWorkingTree(dir: string, message: string): Promise<string> {
    await this.git(dir, ["add", "-A"])
    const staged = await this.git(dir, ["status", "--porcelain"])
    if (staged.length > 0) {
      await this.git(dir, [...COMMITTER, "commit", "--no-verify", "-m", message])
    }
    return this.currentSha(dir)
  }

  /** Materialise `destDir` as a local clone of `srcDir` (git-ignored runtime state is not copied). */
  async cloneLocal(srcDir: string, destDir: string): Promise<void> {
    await run("git", [...BASE_CONFIG, "clone", "--local", srcDir, destDir], { maxBuffer: 32 * 1024 * 1024 })
  }

  /** Pull new commits from the clone origin (the dev directory) into `dir`. */
  async fetchOrigin(dir: string): Promise<void> {
    await this.git(dir, ["fetch", "origin", "--prune"])
  }

  async resetHard(dir: string, sha: string): Promise<void> {
    await this.git(dir, ["reset", "--hard", sha])
  }

  async isRepo(dir: string): Promise<boolean> {
    try {
      await this.git(dir, ["rev-parse", "--git-dir"])
      return true
    } catch (err) {
      this.logger.debug(`Not a git repository at ${dir}: ${(err as Error).message}`)
      return false
    }
  }
}
