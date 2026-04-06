import { Injectable, NotFoundException } from "@nestjs/common"
import { DatabaseService } from "../database/database.service"

interface Item {
  id: number
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

@Injectable()
export class ItemsService {
  constructor(private readonly db: DatabaseService) {}

  findAll(): Item[] {
    return this.db.queryAll<Item>("SELECT * FROM items ORDER BY created_at DESC")
  }

  findOne(id: number): Item {
    const item = this.db.queryOne<Item>("SELECT * FROM items WHERE id = ?", [id])
    if (!item) throw new NotFoundException(`Item ${id} not found`)
    return item
  }

  create(title: string, description?: string): Item {
    const result = this.db.run(
      "INSERT INTO items (title, description) VALUES (?, ?)",
      [title, description ?? null],
    )
    return this.findOne(result.lastInsertRowid as number)
  }

  update(id: number, data: { title?: string; description?: string; status?: string }): Item {
    this.findOne(id)
    this.db.run(
      "UPDATE items SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?",
      [data.title ?? null, data.description ?? null, data.status ?? null, id],
    )
    return this.findOne(id)
  }

  remove(id: number): void {
    this.findOne(id)
    this.db.run("DELETE FROM items WHERE id = ?", [id])
  }
}
