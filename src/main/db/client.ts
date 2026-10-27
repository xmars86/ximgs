import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { getDatabasePath } from '@main/runtime/paths'
import { log } from '@main/runtime/logger'
import { migrations } from './migrations'
import type { DbStatus } from '@shared/ipc'

/**
 * M0 uses sql.js (WASM) so the shell runs without native compile toolchains.
 * Prefer better-sqlite3 later when VS Build Tools / Electron prebuilds are available.
 */

const require = createRequire(__filename)

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbPath: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getDb(): Database {
  if (!db) {
    throw new Error('Database is not open')
  }
  return db
}

export function isDbOpen(): boolean {
  return db !== null
}

export async function openDatabase(): Promise<Database> {
  if (db) {
    return db
  }

  SQL = await initSqlJs({
    locateFile: (file) => join(dirname(require.resolve('sql.js')), file)
  })

  dbPath = getDatabasePath()
  mkdirSync(dirname(dbPath), { recursive: true })

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(fileBuffer))
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON;')
  runMigrations(db)
  persistDatabase()
  log.info('SQLite opened', { path: dbPath, version: getMigrationVersion(db) })
  return db
}

export function closeDatabase(): void {
  if (!db) {
    return
  }
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistDatabase()
  db.close()
  db = null
  log.info('SQLite closed')
}

export function schedulePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistDatabase()
    persistTimer = null
  }, 250)
}

/** Cancel a pending debounced persist and write to disk immediately. */
export function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistDatabase()
}

export function persistDatabase(): void {
  if (!db || !dbPath) {
    return
  }
  const data = db.export()
  writeFileSync(dbPath, Buffer.from(data))
}

export function getMigrationVersion(database: Database = getDb()): number {
  const table = database.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`
  )
  if (!table.length || !table[0]?.values.length) {
    return 0
  }
  const latest = database.exec(`SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations`)
  const value = latest[0]?.values[0]?.[0]
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function getDbStatus(): DbStatus {
  return {
    path: getDatabasePath(),
    isOpen: isDbOpen(),
    migrationVersion: isDbOpen() ? getMigrationVersion() : 0
  }
}

function runMigrations(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const appliedRows = database.exec(`SELECT version FROM schema_migrations`)
  const applied = new Set<number>((appliedRows[0]?.values ?? []).map((row) => Number(row[0])))

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }
    database.run('BEGIN')
    try {
      database.exec(migration.sql)
      database.run(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`, [
        migration.version,
        migration.name
      ])
      database.run('COMMIT')
      log.info('Applied migration', { version: migration.version, name: migration.name })
    } catch (error) {
      database.run('ROLLBACK')
      throw error
    }
  }
}

/** Helper used by repos: run a SELECT and return object rows. */
export function queryAll<T extends object>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params as never[])
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export function queryOne<T extends object>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0]
}

export function runSql(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as never[])
  schedulePersist()
}
