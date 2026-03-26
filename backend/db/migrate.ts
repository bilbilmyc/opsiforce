import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db, pgClient } from "."

async function main() {
  await migrate(db, { migrationsFolder: "./db/migrations", migrationsSchema: "public" })
  await pgClient.end()
}

main()
