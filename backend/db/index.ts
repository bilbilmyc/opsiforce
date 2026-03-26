import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const pgClient = postgres(process.env.DATABASE_URL!)
const db: PostgresJsDatabase<typeof schema> = drizzle(pgClient, { schema })

export { db, pgClient }
export type DrizzleDB = typeof db
