import { Controller, Get } from "@nestjs/common"
import { Public } from "./tenant/tenant.decorator"

@Public()
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" }
  }
}
