; Default install dir: user-writable (avoid Program Files so install-side userData can write).
; Prefer D:\Apps\xImgs when D: exists; otherwise %USERPROFILE%\Apps\xImgs.
; Assisted installer still allows changing the path.
;
; Timezone page: offer to set China Standard Time (Beijing, UTC+8), checked by default.
; Silent installs keep the default (apply China timezone).
;
; All installer-only UI / timezone code is gated with !ifndef BUILD_UNINSTALLER.
; electron-builder treats NSIS unused-symbol warnings as fatal when building the uninstaller.

!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
!include "nsDialogs.nsh"

Var XImgsTzDialog
Var XImgsTzCheckbox
Var XImgsSetChinaTz
!endif

!macro preInit
  !ifndef BUILD_UNINSTALLER
  ; Default ON for silent (/S) installs where the custom page is skipped.
  StrCpy $XImgsSetChinaTz "1"
  !endif

  StrCpy $0 "$PROFILE\Apps\xImgs"
  IfFileExists "D:\*.*" 0 ximgs_install_dir_done
    StrCpy $0 "D:\Apps\xImgs"
  ximgs_install_dir_done:

  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
!macroend

!ifndef BUILD_UNINSTALLER
; Inserted before directory / install-mode pages (assisted installer only).
!macro customWelcomePage
  Page custom XImgsTimezonePageCreate XImgsTimezonePageLeave
!macroend

Function XImgsTimezonePageCreate
  nsDialogs::Create 1018
  Pop $XImgsTzDialog
  ${If} $XImgsTzDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 40u "时区设置$\r$\n$\r$\n建议将系统时区设为中国标准时间（北京时间，UTC+8），便于日志、同步与上传时间一致。"
  Pop $0

  ${NSD_CreateCheckbox} 0 52u 100% 12u "将系统时区设置为中国标准时间（北京时间）"
  Pop $XImgsTzCheckbox
  ; Default checked
  ${NSD_Check} $XImgsTzCheckbox

  ${NSD_CreateLabel} 0 72u 100% 28u "需要管理员权限才能修改系统时区；若安装未提权，设置可能失败，可稍后在 Windows 设置中手动调整。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function XImgsTimezonePageLeave
  ${NSD_GetState} $XImgsTzCheckbox $0
  ; BST_CHECKED == 1 (avoid depending on WinMessages define)
  ${If} $0 == 1
    StrCpy $XImgsSetChinaTz "1"
  ${Else}
    StrCpy $XImgsSetChinaTz "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $XImgsSetChinaTz == "1"
    DetailPrint "正在将系统时区设置为中国标准时间（China Standard Time）..."
    ; System timezone change requires elevation; fail softly if not elevated.
    nsExec::ExecToLog '"$WINDIR\System32\tzutil.exe" /s "China Standard Time"'
    Pop $0
    ${If} $0 == 0
      DetailPrint "已设置系统时区为中国标准时间"
    ${Else}
      DetailPrint "设置时区失败（退出码 $0）。请以管理员运行安装程序，或在 Windows「日期和时间」中手动选择北京时区。"
      MessageBox MB_ICONEXCLAMATION|MB_OK "未能自动设置中国时区（可能缺少管理员权限）。$\r$\n$\r$\n请在 Windows 设置 → 时间和语言 → 时区 中选择「(UTC+08:00) 北京，重庆，香港特别行政区，乌鲁木齐」。"
    ${EndIf}
  ${Else}
    DetailPrint "用户选择不修改系统时区"
  ${EndIf}
!macroend
!endif
