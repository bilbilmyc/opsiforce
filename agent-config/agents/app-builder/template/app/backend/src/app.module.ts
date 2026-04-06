import { Module } from "@nestjs/common"
import { AppController } from "./app.controller"
import { DatabaseModule } from "./database/database.module"
import { ItemsModule } from "./items/items.module"

@Module({
  imports: [DatabaseModule, ItemsModule],
  controllers: [AppController],
})
export class AppModule {}
