import { Controller, NotImplementedException, Param, Post } from "@nestjs/common"

@Controller("external-services")
export class ExternalServicesController {
  @Post(":service")
  notImplemented(@Param("service") service: string): never {
    throw new NotImplementedException(`No handler implemented for external service "${service}"`)
  }
}
