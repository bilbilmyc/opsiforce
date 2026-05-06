---
name: nestjs-api
description: Create NestJS API endpoints with controllers, services, and modules. Use when adding new API routes, creating backend features, handling HTTP requests, adding validation, or modifying any backend code. This is the backend framework — every API change should follow NestJS patterns.
---

# NestJS API Development

The backend uses NestJS with Express adapter. All routes are prefixed with `/api` (set in `main.ts`).

## Module pattern — every feature needs 3 files

### 1. Module

```typescript
import { Module } from "@nestjs/common"
import { TasksController } from "./tasks.controller"
import { TasksService } from "./tasks.service"

@Module({
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
```

### 2. Controller (handles HTTP)

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, BadRequestException } from "@nestjs/common"
import { TasksService } from "./tasks.service"

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query("status") status?: string) {
    return this.tasksService.findAll(status)
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.tasksService.findOne(id)
  }

  @Post()
  create(@Body() body: { title: string; description?: string }) {
    if (!body.title) throw new BadRequestException("Title is required")
    return this.tasksService.create(body.title, body.description)
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.tasksService.update(id, body)
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    this.tasksService.remove(id)
    return { ok: true }
  }
}
```

### 3. Service (business logic + database)

```typescript
import { Injectable, NotFoundException } from "@nestjs/common"
import { DatabaseService } from "../database/database.service"

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  findAll(status?: string) {
    if (status) {
      return this.db.queryAll("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC", [status])
    }
    return this.db.queryAll("SELECT * FROM tasks ORDER BY created_at DESC")
  }

  findOne(id: number) {
    const task = this.db.queryOne("SELECT * FROM tasks WHERE id = ?", [id])
    if (!task) throw new NotFoundException(`Task ${id} not found`)
    return task
  }

  create(title: string, description?: string) {
    const result = this.db.run("INSERT INTO tasks (title, description) VALUES (?, ?)", [title, description ?? null])
    return this.findOne(result.lastInsertRowid as number)
  }

  update(id: number, data: Record<string, unknown>) {
    this.findOne(id)
    const sets = Object.keys(data).map(k => `${k} = ?`).join(", ")
    this.db.run(`UPDATE tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`, [...Object.values(data), id])
    return this.findOne(id)
  }

  remove(id: number) {
    this.findOne(id)
    this.db.run("DELETE FROM tasks WHERE id = ?", [id])
  }
}
```

## CRITICAL: Register every new module

Add to `backend/src/app.module.ts`:

```typescript
import { TasksModule } from "./tasks/tasks.module"

@Module({
  imports: [DatabaseModule, ItemsModule, TasksModule],
  controllers: [AppController],
})
export class AppModule {}
```

Forgetting this is the #1 cause of "route not found" errors. Every new module MUST be added to the imports array.

## File locations

```
backend/src/
  tasks/
    tasks.module.ts
    tasks.controller.ts
    tasks.service.ts
```

## DatabaseService methods

- `queryAll<T>(sql, params?)` → T[]
- `queryOne<T>(sql, params?)` → T | undefined
- `run(sql, params?)` → { changes, lastInsertRowid }
- `exec(sql)` → void (raw SQL, multiple statements)

## Key decorators

- `@Controller("path")` — route prefix
- `@Get()`, `@Post()`, `@Put()`, `@Delete()` — HTTP methods
- `@Param("name", ParseIntPipe)` — URL params with type coercion
- `@Body()` — request body
- `@Query("name")` — query string params

## Exceptions

- `NotFoundException` → 404
- `BadRequestException` → 400
- `UnauthorizedException` → 401
- `ForbiddenException` → 403
- `ConflictException` → 409

## Existing example

See `backend/src/items/` for a complete working CRUD module.
