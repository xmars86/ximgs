import { queryAll, queryOne, runSql, persistDatabase } from '../client'
import type { TagDto } from '@shared/library'
import { DEFAULT_TAG_NAMES } from '@shared/library'

interface TagRow {
  id: number
  name: string
  color: string | null
  created_at: string
}

function mapTag(row: TagRow): TagDto {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: row.color == null ? null : String(row.color),
    createdAt: String(row.created_at)
  }
}

export function listTags(): TagDto[] {
  return queryAll<TagRow>(
    `SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE`
  ).map(mapTag)
}

export function getTagById(id: number): TagDto | undefined {
  const row = queryOne<TagRow>(`SELECT id, name, color, created_at FROM tags WHERE id = ?`, [id])
  return row ? mapTag(row) : undefined
}

export function createTag(name: string, color: string | null = null): TagDto {
  runSql(`INSERT INTO tags (name, color) VALUES (?, ?)`, [name, color])
  persistDatabase()
  const row = queryOne<TagRow>(`SELECT id, name, color, created_at FROM tags WHERE name = ?`, [
    name
  ])
  if (!row) {
    throw new Error('Failed to create tag')
  }
  return mapTag(row)
}

export function deleteTag(id: number): boolean {
  runSql(`DELETE FROM asset_tags WHERE tag_id = ?`, [id])
  runSql(`DELETE FROM tags WHERE id = ?`, [id])
  persistDatabase()
  return true
}

export function listTagsForAsset(assetId: number): TagDto[] {
  return queryAll<TagRow>(
    `SELECT t.id, t.name, t.color, t.created_at
     FROM tags t
     INNER JOIN asset_tags at ON at.tag_id = t.id
     WHERE at.asset_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    [assetId]
  ).map(mapTag)
}

export function setAssetTags(assetId: number, tagIds: number[]): void {
  runSql(`DELETE FROM asset_tags WHERE asset_id = ?`, [assetId])
  for (const tagId of tagIds) {
    runSql(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`, [assetId, tagId])
  }
  persistDatabase()
}

export function seedDefaultTags(): void {
  const count = Number(queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM tags`)?.count ?? 0)
  if (count > 0) {
    return
  }
  for (const name of DEFAULT_TAG_NAMES) {
    runSql(`INSERT INTO tags (name, color) VALUES (?, NULL)`, [name])
  }
  persistDatabase()
}
