import { reactive } from 'vue'

export type ToastKind = 'ok' | 'err' | 'info'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  leaving: boolean
}

const state = reactive({
  items: [] as ToastItem[]
})

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number): void {
  const item = state.items.find((t) => t.id === id)
  if (!item || item.leaving) return
  item.leaving = true
  const leaveTimer = setTimeout(() => {
    state.items = state.items.filter((t) => t.id !== id)
    timers.delete(id)
  }, 180)
  timers.set(id, leaveTimer)
}

export function showToast(message: string, kind: ToastKind = 'ok', durationMs = 2600): void {
  const text = message.trim()
  if (!text) return
  const id = ++seq
  state.items.push({ id, message: text, kind, leaving: false })
  const timer = setTimeout(() => dismiss(id), durationMs)
  timers.set(id, timer)
}

export function useToastState() {
  return state
}

export const toast = {
  ok: (message: string) => showToast(message, 'ok'),
  err: (message: string) => showToast(message, 'err', 4200),
  info: (message: string) => showToast(message, 'info')
}
