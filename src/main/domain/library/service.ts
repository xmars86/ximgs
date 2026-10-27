import { dialog, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { AppError } from '@shared/errors'
import type {
  CreateStoreInput,
  CreateTagInput,
  EnsureProductInput,
  ImportClipboardInput,
  ImportPathsInput,
  UpdateAssetsInput,
  UpdateStoreInput,
  AssetQuery,
  SetAssetTagsInput
} from '@shared/library'
import { loadConfig, saveConfig } from '@main/runtime/config'
import { setLibraryRoot, getLibraryRoot } from '@main/runtime/paths'
import * as storesRepo from '@main/db/repos/stores'
import * as productsRepo from '@main/db/repos/products'
import * as tagsRepo from '@main/db/repos/tags'
import * as assetsRepo from '@main/db/repos/assets'
import { slugifyStoreName, sanitizeSegment } from './layout'
import { importClipboard, importPaths } from './importer'
import { requestCancelImport } from './importCancel'

export function getRoot(): { libraryRoot: string | null } {
  return { libraryRoot: getLibraryRoot() }
}

export function setRoot(path: string): { libraryRoot: string } {
  const trimmed = path.trim()
  if (!trimmed) {
    throw new AppError('INVALID_PATH', '素材库路径不能为空')
  }
  mkdirSync(trimmed, { recursive: true })
  const config = loadConfig()
  config.libraryRoot = trimmed
  saveConfig(config)
  setLibraryRoot(trimmed)
  return { libraryRoot: trimmed }
}

export async function chooseRoot(): Promise<{ libraryRoot: string | null }> {
  const win = BrowserWindow.getFocusedWindow()
  const result = win
    ? await dialog.showOpenDialog(win, {
        title: '选择素材库根目录',
        properties: ['openDirectory', 'createDirectory']
      })
    : await dialog.showOpenDialog({
        title: '选择素材库根目录',
        properties: ['openDirectory', 'createDirectory']
      })
  if (result.canceled || !result.filePaths[0]) {
    return { libraryRoot: null }
  }
  return setRoot(result.filePaths[0])
}

export function listStores() {
  return storesRepo.listStores()
}

export function createStore(input: CreateStoreInput) {
  const name = input.name.trim()
  if (!name) {
    throw new AppError('INVALID_STORE', '店铺名称不能为空')
  }
  const slug = sanitizeSegment(input.slug?.trim() || slugifyStoreName(name), '店铺 slug')
  if (storesRepo.getStoreBySlug(slug)) {
    throw new AppError('STORE_EXISTS', `店铺 slug 已存在: ${slug}`)
  }
  return storesRepo.createStore({ name, slug, platform: input.platform })
}

export function updateStore(input: UpdateStoreInput) {
  return storesRepo.updateStore(input)
}

export function deleteStore(id: number) {
  try {
    storesRepo.deleteStore(id)
    return { deleted: true }
  } catch (error) {
    throw new AppError(
      'STORE_NOT_EMPTY',
      error instanceof Error ? error.message : '无法删除店铺'
    )
  }
}

export function listProducts(storeId: number) {
  return productsRepo.listProductsByStore(storeId)
}

export function ensureProduct(input: EnsureProductInput) {
  const asin = sanitizeSegment(input.asinOrSku, 'ASIN/SKU')
  return productsRepo.ensureProduct({
    storeId: input.storeId,
    asinOrSku: asin,
    title: input.title
  })
}

export function listAssets(query: AssetQuery) {
  return assetsRepo.listAssets(query)
}

export function getAsset(id: number) {
  const asset = assetsRepo.getAssetById(id)
  if (!asset) {
    throw new AppError('ASSET_NOT_FOUND', '素材不存在')
  }
  return asset
}

export function updateAssets(input: UpdateAssetsInput) {
  if (!input.ids.length) {
    return { updated: 0 }
  }
  // Moving store/asin is deferred; M1 supports type + note batch edit.
  const updated = assetsRepo.updateAssetsMeta(input.ids, {
    assetType: input.patch.assetType,
    note: input.patch.note
  })
  return { updated }
}

export function trashAssets(ids: number[]) {
  return { trashed: assetsRepo.trashAssets(ids) }
}

export function restoreAssets(ids: number[]) {
  return { restored: assetsRepo.restoreAssets(ids) }
}

export function listTags() {
  return tagsRepo.listTags()
}

export function createTag(input: CreateTagInput) {
  const name = input.name.trim()
  if (!name) {
    throw new AppError('INVALID_TAG', '标签名不能为空')
  }
  try {
    return tagsRepo.createTag(name, input.color ?? null)
  } catch {
    throw new AppError('TAG_EXISTS', `标签已存在: ${name}`)
  }
}

export function deleteTag(id: number) {
  return { deleted: tagsRepo.deleteTag(id) }
}

export function setAssetTags(input: SetAssetTagsInput) {
  tagsRepo.setAssetTags(input.assetId, input.tagIds)
  return { ok: true as const }
}

export async function chooseImportFiles(): Promise<{ paths: string[] }> {
  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: '选择图片文件',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) {
    return { paths: [] }
  }
  return { paths: result.filePaths }
}

export async function chooseImportFolder(): Promise<{ path: string | null }> {
  const win = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: '选择图片文件夹',
    properties: ['openDirectory']
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) {
    return { path: null }
  }
  return { path: result.filePaths[0] }
}

export async function runImportPaths(input: ImportPathsInput) {
  return importPaths(input)
}

export async function runImportClipboard(input: ImportClipboardInput) {
  return importClipboard(input)
}

export function cancelImport(taskId: string) {
  return { cancelled: requestCancelImport(taskId) }
}

export function bootstrapLibraryDomain(): void {
  tagsRepo.seedDefaultTags()
}
