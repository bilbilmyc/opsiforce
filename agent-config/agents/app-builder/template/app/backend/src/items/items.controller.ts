import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe, BadRequestException } from "@nestjs/common"
import { ItemsService } from "./items.service"

@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findAll() {
    return this.itemsService.findAll()
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.itemsService.findOne(id)
  }

  @Post()
  create(@Body() body: { title?: string; description?: string }) {
    if (!body.title) throw new BadRequestException("Title is required")
    return this.itemsService.create(body.title, body.description)
  }

  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { title?: string; description?: string; status?: string },
  ) {
    return this.itemsService.update(id, body)
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    this.itemsService.remove(id)
    return { ok: true }
  }
}
