; BLOCK CITY TYCOON — custom NSIS script for electron-builder (package.json → build.nsis.include)
; - default install folder: C:\Program Files\Block City Tycoon
; - "Create Desktop Shortcut" checkbox page after the folder page (checked by default)
; - the uninstaller removes the desktop shortcut; saves in %APPDATA% are kept

!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh

!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Block City Tycoon"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Block City Tycoon"
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Block City Tycoon"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\Block City Tycoon"
!macroend

!ifndef BUILD_UNINSTALLER
  Var BctDesktopCheckbox
  Var BctCreateDesktop

  !macro customInit
    StrCpy $BctCreateDesktop ${BST_CHECKED}
  !macroend

  !macro customPageAfterChangeDir
    Page custom BctShortcutPageShow BctShortcutPageLeave
  !macroend

  Function BctShortcutPageShow
    GetDlgItem $1 $HWNDPARENT 1037
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Shortcuts"
    GetDlgItem $1 $HWNDPARENT 1038
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Choose the shortcuts for BLOCK CITY TYCOON."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "A Start Menu shortcut is always created. The game can be removed any time from Windows Settings > Apps > Installed apps."
    Pop $0
    ${NSD_CreateCheckbox} 0 34u 100% 12u "Create Desktop Shortcut"
    Pop $BctDesktopCheckbox
    ${NSD_SetState} $BctDesktopCheckbox $BctCreateDesktop
    nsDialogs::Show
  FunctionEnd

  Function BctShortcutPageLeave
    ${NSD_GetState} $BctDesktopCheckbox $BctCreateDesktop
  FunctionEnd

  !macro customInstall
    ${If} $BctCreateDesktop == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${Else}
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}
  !macroend
!endif

!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
!macroend
