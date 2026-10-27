import type { XimgsApi } from './index'

declare global {
  interface Window {
    ximgs: XimgsApi
  }
}

export {}
