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
  ; Try multiple times with a short delay to handle slow process shutdown.
  nsExec::Exec 'taskkill /F /IM "Slate.exe" /T'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Slate.exe"'
  Pop $0
  ; Wait briefly for file handles to release
  Sleep 1000

  ; Per-user install is the default, but check both hives — the user may have
  ; elevated to an all-users install previously.
  !insertmacro cleanStaleInstall HKCU
  !insertmacro cleanStaleInstall HKLM
!macroend

!macro customUnInit
  ; Same force-close for uninstall: "Slate cannot be closed. Please close it
  ; manually" must never block a user from removing the app.
  nsExec::Exec 'taskkill /F /IM "Slate.exe" /T'
  Pop $0
  nsExec::Exec 'taskkill /F /IM "Slate.exe"'
  Pop $0
  Sleep 1000
!macroend

; ── "Open with" registration for .md / .markdown / .txt ────────────────────
; Adds Slate to the Open-with list WITHOUT taking over the default app (unlike
; electron-builder's `fileAssociations`, whose APP_ASSOCIATE rewrites the
; extension's default ProgID). Writes ProgIDs + OpenWithProgids + an
; Applications entry under SHELL_CONTEXT (HKCU for this per-user install).
; The app receives the file as argv[1] ("%1"); a running instance gets it via
; second-instance.

!macro slateRegisterProgId PROGID DESCRIPTION
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}" "" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}" "FriendlyTypeName" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\shell\open" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customInstall
  !insertmacro slateRegisterProgId "Slate.Markdown" "Markdown document"
  !insertmacro slateRegisterProgId "Slate.Text" "Text document"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "Slate.Markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "Slate.Markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "Slate.Text" ""

  ; Applications\<exe>: name + supported types for the "Choose another app" list.
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".md" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".markdown" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".txt" ""

  ; SHCNE_ASSOCCHANGED: refresh Explorer's association cache.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "Slate.Markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "Slate.Markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.txt\OpenWithProgids" "Slate.Text"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Slate.Markdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Slate.Text"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
