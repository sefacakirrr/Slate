; Custom NSIS hooks (electron-builder auto-includes buildResources/installer.nsh).
;
; Fixes two failure chains seen when users move/delete the install location:
;  1. "Slate cannot be closed" → locked files → "Error opening file for
;     writing" mid-install. The installer's polite window-close can miss
;     Slate's extra processes (quick-capture / sticky renderers, GPU child),
;     so force-kill the whole process tree before touching any files.
;  2. A stale uninstall registry entry pointing at a directory the user
;     deleted or moved ("Windows cannot find D:\...\Uninstall Slate.exe").
;     If the registered uninstaller no longer exists on disk, drop the dead
;     keys so this install starts clean, lands in the chosen directory, and
;     rewrites the Apps-list entry + shortcuts to the new location.

!macro cleanStaleInstall ROOT_KEY
  ReadRegStr $R0 ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R0 != ""
    ${IfNot} ${FileExists} "$R0\Uninstall ${PRODUCT_FILENAME}.exe"
      DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}
  ; Also clean registry if the install location drive no longer exists
  ${If} $R0 != ""
    StrCpy $R1 $R0 3
    ${IfNot} ${FileExists} "$R1"
      DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  ; Kill running Slate instances (and child processes) so no file in the
  ; install directory is locked. Silently no-ops when Slate isn't running.
  nsExec::Exec 'taskkill /F /IM Slate.exe /T'
  Pop $0

  ; Per-user install is the default, but check both hives — the user may have
  ; elevated to an all-users install previously.
  !insertmacro cleanStaleInstall HKCU
  !insertmacro cleanStaleInstall HKLM
!macroend

!macro customUnInit
  ; Same force-close for uninstall: "Slate cannot be closed. Please close it
  ; manually" must never block a user from removing the app.
  nsExec::Exec 'taskkill /F /IM Slate.exe /T'
  Pop $0
!macroend
