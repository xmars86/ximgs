/** Desktop shell prefs (tray / login item). Stored in app config JSON. */

export interface DesktopPrefs {
  /** Close / X hides to tray instead of quitting. Default true. */
  closeToTray: boolean
  /** Launch at OS login. Default false. */
  openAtLogin: boolean
  /** After launch (incl. login item), stay in tray until opened. Default false. */
  startHidden: boolean
  /** User has seen the first “minimized to tray” hint. */
  trayHintSeen: boolean
}

export const DEFAULT_DESKTOP_PREFS: DesktopPrefs = {
  closeToTray: true,
  openAtLogin: false,
  startHidden: false,
  trayHintSeen: false
}

export type DesktopPrefsUpdate = Partial<
  Pick<DesktopPrefs, 'closeToTray' | 'openAtLogin' | 'startHidden'>
>

/** Main → renderer shell events (toast / tray hints). */
export type ShellEvent =
  | { type: 'tray-minimized'; firstTime: boolean }
  | { type: 'toast'; kind: 'ok' | 'err' | 'info'; message: string }
