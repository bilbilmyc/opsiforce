import { Module } from "@nestjs/common"
import { AppController } from "./app.controller"
import { DatabaseModule } from "./database/database.module"
import { ExternalServicesModule } from "./external-services/external-services.module"
import { ItemsModule } from "./items/items.module"

@Module({
  imports: [DatabaseModule, ExternalServicesModule, ItemsModule],
  controllers: [AppController],
})
export class AppModule {}
