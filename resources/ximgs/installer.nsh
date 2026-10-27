; Default install dir: user-writable (avoid Program Files so install-side userData can write).
; Prefer D:\Apps\xImgs when D: exists; otherwise %USERPROFILE%\Apps\xImgs.
; Assisted installer still allows changing the path.
!macro preInit
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
