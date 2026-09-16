import { Controller, Get } from "@nestjs/common"
import * as fs from "fs"
import * as path from "path"

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { status: "ok" }
  }

  @Get("app-meta")
  getAppMeta() {
    const metaPath = path.resolve(process.cwd(), "app.meta.json")
    if (!fs.existsSync(metaPath)) {
      return { exists: false }
    }
    const content = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
    return { exists: true, ...content }
  }
}
