/** Pure decision: upload when no prior synced md5 match. */
export function shouldUploadFile(existingMd5: string | null | undefined, currentMd5: string): boolean {
  return !existingMd5 || existingMd5 !== currentMd5
}
