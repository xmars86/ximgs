import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { migrations } from '../../src/main/db/migrations'

const require = createRequire(import.meta.url)
const wasmDir = dirname(require.resolve('sql.js'))

describe('SQLite migrations', () => {
  it('applies initial schema', async () => {
    const SQL = await initSqlJs({
      locateFile: (file) => join(wasmDir, file)
    })
    const db = new SQL.Database()

    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    for (const migration of migrations) {
      db.exec(migration.sql)
      db.run(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`, [
        migration.version,
        migration.name
      ])
    }

    const tables = db.exec(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    const names = (tables[0]?.values ?? []).map((row) => String(row[0]))
    expect(names).toEqual(
      expect.arrayContaining([
        'stores',
        'products',
        'assets',
        'tags',
        'asset_tags',
        'process_jobs',
        'storage_targets',
        'uploads',
        'audit_logs',
        'sync_settings',
        'sync_files',
        'schema_migrations'
      ])
    )

    const version = db.exec(`SELECT MAX(version) AS version FROM schema_migrations`)
    expect(Number(version[0]?.values[0]?.[0])).toBe(migrations[migrations.length - 1]!.version)
    db.close()

    // Keep path helpers referenced for Node ESM tooling stability in some runners
    void fileURLToPath
  })
})
