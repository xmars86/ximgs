const cancelledTasks = new Set<string>()

export function requestCancelImport(taskId: string): boolean {
  cancelledTasks.add(taskId)
  return true
}

export function isImportCancelled(taskId: string): boolean {
  return cancelledTasks.has(taskId)
}

export function clearImportCancel(taskId: string): void {
  cancelledTasks.delete(taskId)
}
