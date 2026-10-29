import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { getLocale } from './runtime/config'
import { getAppPaths } from './runtime/paths'
import { log } from './runtime/logger'
import { showMainWindow } from './tray'

/** Public project home (Help → About). */
export const XIMGS_GITHUB_URL = 'https://github.com/xmars86/ximgs'

function zh(): boolean {
  return getLocale() === 'zh-CN'
}

function openGitHub(): void {
  void shell.openExternal(XIMGS_GITHUB_URL).catch((error) => {
    log.warn('openGitHub failed', error)
  })
}

function showAbout(): void {
  const version = app.getVersion()
  void dialog
    .showMessageBox({
      type: 'info',
      title: zh() ? '关于 xImgs' : 'About xImgs',
      message: 'xImgs',
      detail: zh()
        ? `版本 ${version}\n稳定图链，助力出海\n\n单机跨境电商图床\n\n${XIMGS_GITHUB_URL}`
        : `Version ${version}\nStable image links for cross-border commerce\n\nDesktop image host\n\n${XIMGS_GITHUB_URL}`,
      buttons: zh() ? ['打开 GitHub', '关闭'] : ['Open GitHub', 'Close'],
      defaultId: 0,
      cancelId: 1
    })
    .then((result) => {
      if (result.response === 0) openGitHub()
    })
    .catch((error) => {
      log.warn('showAbout failed', error)
    })
}

function openLogsFolder(): void {
  const { logs } = getAppPaths()
  void shell.openPath(logs).then((err) => {
    if (err) log.warn('openLogsFolder failed', err)
  })
}

function buildTemplate(): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin'
  const showDevTools = !app.isPackaged

  const editSubmenu: MenuItemConstructorOptions[] = [
    { role: 'undo', label: zh() ? '撤销' : 'Undo' },
    { role: 'redo', label: zh() ? '重做' : 'Redo' },
    { type: 'separator' },
    { role: 'cut', label: zh() ? '剪切' : 'Cut' },
    { role: 'copy', label: zh() ? '复制' : 'Copy' },
    { role: 'paste', label: zh() ? '粘贴' : 'Paste' },
    { role: 'selectAll', label: zh() ? '全选' : 'Select All' }
  ]

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload', label: zh() ? '重新加载' : 'Reload' },
    ...(showDevTools
      ? ([
          { role: 'forceReload', label: zh() ? '强制重新加载' : 'Force Reload' },
          { role: 'toggleDevTools', label: zh() ? '开发者工具' : 'Toggle Developer Tools' }
        ] as MenuItemConstructorOptions[])
      : []),
    { type: 'separator' },
    { role: 'resetZoom', label: zh() ? '实际大小' : 'Actual Size' },
    { role: 'zoomIn', label: zh() ? '放大' : 'Zoom In' },
    { role: 'zoomOut', label: zh() ? '缩小' : 'Zoom Out' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: zh() ? '进入全屏' : 'Toggle Full Screen' }
  ]

  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: zh() ? '关于 xImgs' : 'About xImgs',
      click: () => showAbout()
    },
    {
      label: zh() ? 'GitHub 项目主页' : 'GitHub Repository',
      click: () => openGitHub()
    },
    {
      label: zh() ? '打开日志目录' : 'Open Logs Folder',
      click: () => openLogsFolder()
    }
  ]

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.getName(),
      submenu: [
        {
          label: zh() ? '关于 xImgs' : 'About xImgs',
          click: () => showAbout()
        },
        { type: 'separator' },
        { role: 'hide', label: zh() ? '隐藏 xImgs' : 'Hide xImgs' },
        { role: 'hideOthers', label: zh() ? '隐藏其它' : 'Hide Others' },
        { role: 'unhide', label: zh() ? '显示全部' : 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: zh() ? '退出 xImgs' : 'Quit xImgs' }
      ]
    })
  } else {
    template.push({
      label: zh() ? '文件' : 'File',
      submenu: [
        {
          label: zh() ? '显示主窗口' : 'Show Window',
          click: () => {
            showMainWindow(
              BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
            )
          }
        },
        { type: 'separator' },
        { role: 'quit', label: zh() ? '退出' : 'Quit' }
      ]
    })
  }

  template.push(
    {
      label: zh() ? '编辑' : 'Edit',
      submenu: editSubmenu
    },
    {
      label: zh() ? '查看' : 'View',
      submenu: viewSubmenu
    },
    {
      label: zh() ? '窗口' : 'Window',
      submenu: isMac
        ? [
            { role: 'minimize', label: zh() ? '最小化' : 'Minimize' },
            { role: 'zoom', label: zh() ? '缩放' : 'Zoom' },
            { type: 'separator' },
            { role: 'front', label: zh() ? '全部置于顶层' : 'Bring All to Front' }
          ]
        : [
            { role: 'minimize', label: zh() ? '最小化' : 'Minimize' },
            { role: 'close', label: zh() ? '关闭窗口' : 'Close Window' }
          ]
    },
    {
      label: zh() ? '帮助' : 'Help',
      submenu: isMac
        ? [
            {
              label: zh() ? 'GitHub 项目主页' : 'GitHub Repository',
              click: () => openGitHub()
            },
            {
              label: zh() ? '打开日志目录' : 'Open Logs Folder',
              click: () => openLogsFolder()
            }
          ]
        : helpSubmenu
    }
  )

  return template
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
}

export function refreshApplicationMenu(): void {
  try {
    installApplicationMenu()
  } catch (error) {
    log.warn('refreshApplicationMenu failed', error)
  }
}
