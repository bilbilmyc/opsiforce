import { Body, Controller, Post } from "@nestjs/common"

interface DoorbellNotification {
  service: string
  rowIds: number[]
}

@Controller("external-services")
export class ExternalServicesController {
  @Post("incoming-email")
  incomingEmail(@Body() notification: DoorbellNotification): { received: true } {
    return { received: true }
  }

  @Post("whatsapp")
  whatsapp(@Body() notification: DoorbellNotification): { received: true } {
    return { received: true }
  }
}
