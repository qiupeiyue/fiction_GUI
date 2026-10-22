; ================= Adaa的小说工坊：安装 / 卸载自定义脚本 =================
; 1) 安装向导按系统语言自动切换（简体 / 繁体 / 英文 / 日文，其它语言用英文）
; 2) 选完安装目录后，多一页让用户设置：导出路径 / 历史版本保存路径 / 语言
; 3) 卸载提示按语言显示，并列出导出与历史版本目录

!include LogicLib.nsh
!include FileFunc.nsh
!include nsDialogs.nsh

; ---------------- 变量（必须在任何函数之前声明） ----------------
Var FxExportDir
Var FxHistoryDir
Var FxAppName           ; 当前语言下的软件名（开始菜单 / 桌面快捷方式用）
Var FxUninstName        ; 当前语言下的卸载项名称
!ifndef BUILD_UNINSTALLER
Var FxLangKey
Var FxExportCtl
Var FxHistoryCtl
Var FxLangCtl
Var FxPickedLang        ; 用户在页面上选的（0 简 / 1 繁 / 2 英 / 3 日）
Var FxUiTitle
Var FxUiExport
Var FxUiHistory
Var FxUiLang
Var FxLangZhCn
Var FxLangZhTw
Var FxLangEn
Var FxLangJa
!endif

!macro customHeader
  !undef UNINSTALL_FILENAME
  !define UNINSTALL_FILENAME "Uninstall.exe"
!macroend

; ---------------- 语言 ----------------
; 跟着系统默认界面语言走：简体 / 繁體 / 日本語，其它一律英文。
; 用宏而不是 Function：同一份脚本要同时给安装程序和卸载程序用，
; 卸载程序里 Call 只能调用 un. 开头的函数，宏在哪里展开就在哪里生效。
; 2052 简中 / 4100 简中(新加坡) / 1028 繁中 / 3076 繁中(香港) / 5124 繁中(澳门) / 1041 日文
!macro fxPickLanguage
  StrCpy $2 2
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r1'
  ${If} $1 = 2052
  ${OrIf} $1 = 4100
    StrCpy $2 0
  ${ElseIf} $1 = 1028
  ${OrIf} $1 = 3076
  ${OrIf} $1 = 5124
    StrCpy $2 1
  ${ElseIf} $1 = 1041
    StrCpy $2 3
  ${EndIf}
  StrCpy $LANGUAGE 1033
  ${If} $2 = 0
    StrCpy $LANGUAGE 2052
  ${ElseIf} $2 = 1
    StrCpy $LANGUAGE 1028
  ${ElseIf} $2 = 3
    StrCpy $LANGUAGE 1041
  ${EndIf}
  !insertmacro fxLoadNames
!macroend

; 名字按语言取：简 / 繁 / 日 / 英（其它语言用英文）
!macro fxLoadNames
  ${If} $LANGUAGE == 2052
    StrCpy $FxAppName "Adaa的小说工坊"
    StrCpy $FxUninstName "卸载"
  ${ElseIf} $LANGUAGE == 1028
    StrCpy $FxAppName "Adaa的小說工坊"
    StrCpy $FxUninstName "解除安裝"
  ${ElseIf} $LANGUAGE == 1041
    StrCpy $FxAppName "Adaaの小説工房"
    StrCpy $FxUninstName "アンインストール"
  ${Else}
    StrCpy $FxAppName "Adaa's Fiction Workshop"
    StrCpy $FxUninstName "Uninstall"
  ${EndIf}
!macroend

; ---------------- 界面文案 ----------------
!ifndef BUILD_UNINSTALLER
!macro fxLoadUiText
  ${If} $LANGUAGE == 2052
    StrCpy $FxUiTitle "保存位置与语言"
    StrCpy $FxUiExport "导出文件保存到"
    StrCpy $FxUiHistory "历史版本保存到"
    StrCpy $FxUiLang "界面语言"
  ${ElseIf} $LANGUAGE == 1028
    StrCpy $FxUiTitle "儲存位置與語言"
    StrCpy $FxUiExport "匯出檔案儲存到"
    StrCpy $FxUiHistory "歷史版本儲存到"
    StrCpy $FxUiLang "介面語言"
  ${ElseIf} $LANGUAGE == 1041
    StrCpy $FxUiTitle "保存先と言語"
    StrCpy $FxUiExport "書き出し先"
    StrCpy $FxUiHistory "履歴の保存先"
    StrCpy $FxUiLang "表示言語"
  ${Else}
    StrCpy $FxUiTitle "Save locations and language"
    StrCpy $FxUiExport "Export files to"
    StrCpy $FxUiHistory "History versions to"
    StrCpy $FxUiLang "Language"
  ${EndIf}
  StrCpy $FxLangZhCn "简体中文"
  StrCpy $FxLangZhTw "繁體中文"
  StrCpy $FxLangEn "English"
  StrCpy $FxLangJa "日本語"
!macroend
!endif

; ---------------- 安装位置 ----------------
; 默认 C:\Program Files\Adaa_Fiction_Workshop（安装时仍可改）
!macro customInit
  !insertmacro fxPickLanguage
  ; 窗口标题栏也跟着语言走（默认写的是编译时的产品名）
  SendMessage $HWNDPARENT 0x000C 0 "STR:$FxAppName"
  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  ; 没装过、或者装在旧目录 fiction_GUI 下：都改成新目录；
  ; 用户以前自己选过的其它目录保持不动
  ${If} $0 == ""
    StrCpy $INSTDIR "$PROGRAMFILES64\Adaa_Fiction_Workshop"
  ${ElseIf} $0 == "$PROGRAMFILES64\fiction_GUI"
    StrCpy $INSTDIR "$PROGRAMFILES64\Adaa_Fiction_Workshop"
  ${EndIf}
!macroend

; ---------------- 选完安装目录后的这一页 ----------------
; 只在安装程序里定义；卸载程序会共用同一份脚本，页面函数不包起来会变成“未被引用”并报错。
!ifndef BUILD_UNINSTALLER
Function fxPathsPageCreate
  !insertmacro fxLoadUiText
  ; 给这一页写个标题（MUI 的 MUI_HEADER_TEXT 宏在这里还用不了：
  ; 本文件是在 MUI2.nsh 之前被 include 的，所以直接给标题控件发 WM_SETTEXT）
  SendMessage $HWNDPARENT 0x000C 0 "STR:$FxAppName"
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 0x000C 0 "STR:$FxUiTitle"
  ; 默认路径：文档\fiction_GUI\output|history（和程序里的默认值一致）
  SetShellVarContext current
  StrCpy $FxExportDir "$DOCUMENTS\fiction_GUI\output"
  StrCpy $FxHistoryDir "$DOCUMENTS\fiction_GUI\history"
  SetShellVarContext all
  ; 语言默认跟随安装向导当前的语言
  ${If} $LANGUAGE == 1028
    StrCpy $FxPickedLang 1
  ${ElseIf} $LANGUAGE == 1041
    StrCpy $FxPickedLang 3
  ${ElseIf} $LANGUAGE == 1033
    StrCpy $FxPickedLang 2
  ${Else}
    StrCpy $FxPickedLang 0
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "$FxUiExport"
  Pop $0
  ${NSD_CreateDirRequest} 0 13u 78% 13u "$FxExportDir"
  Pop $FxExportCtl
  ${NSD_CreateBrowseButton} 79% 13u 21% 13u "…"
  Pop $0
  ${NSD_OnClick} $0 fxBrowseExport

  ${NSD_CreateLabel} 0 32u 100% 12u "$FxUiHistory"
  Pop $0
  ${NSD_CreateDirRequest} 0 45u 78% 13u "$FxHistoryDir"
  Pop $FxHistoryCtl
  ${NSD_CreateBrowseButton} 79% 45u 21% 13u "…"
  Pop $0
  ${NSD_OnClick} $0 fxBrowseHistory

  ${NSD_CreateLabel} 0 64u 40% 12u "$FxUiLang"
  Pop $0
  ${NSD_CreateDropList} 0 77u 60% 40u ""
  Pop $FxLangCtl
  ${NSD_CB_AddString} $FxLangCtl "$FxLangZhCn"
  ${NSD_CB_AddString} $FxLangCtl "$FxLangZhTw"
  ${NSD_CB_AddString} $FxLangCtl "$FxLangEn"
  ${NSD_CB_AddString} $FxLangCtl "$FxLangJa"
  ${NSD_CB_SelectString} $FxLangCtl "$FxLangZhCn"
  ${If} $FxPickedLang == 1
    ${NSD_CB_SelectString} $FxLangCtl "$FxLangZhTw"
  ${ElseIf} $FxPickedLang == 2
    ${NSD_CB_SelectString} $FxLangCtl "$FxLangEn"
  ${ElseIf} $FxPickedLang == 3
    ${NSD_CB_SelectString} $FxLangCtl "$FxLangJa"
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function fxBrowseExport
  ${NSD_GetText} $FxExportCtl $FxExportDir
  nsDialogs::SelectFolderDialog "$FxUiExport" "$FxExportDir"
  Pop $0
  ${If} $0 != error
    StrCpy $FxExportDir $0
    ${NSD_SetText} $FxExportCtl "$FxExportDir"
  ${EndIf}
FunctionEnd

Function fxBrowseHistory
  ${NSD_GetText} $FxHistoryCtl $FxHistoryDir
  nsDialogs::SelectFolderDialog "$FxUiHistory" "$FxHistoryDir"
  Pop $0
  ${If} $0 != error
    StrCpy $FxHistoryDir $0
    ${NSD_SetText} $FxHistoryCtl "$FxHistoryDir"
  ${EndIf}
FunctionEnd

Function fxPathsPageLeave
  ${NSD_GetText} $FxExportCtl $FxExportDir
  ${NSD_GetText} $FxHistoryCtl $FxHistoryDir
  ${NSD_GetText} $FxLangCtl $0
  SetShellVarContext current
  ; 两个目录留空就退回默认位置（文档\fiction_GUI\...）
  ${If} $FxExportDir == ""
    StrCpy $FxExportDir "$DOCUMENTS\fiction_GUI\output"
  ${EndIf}
  ${If} $FxHistoryDir == ""
    StrCpy $FxHistoryDir "$DOCUMENTS\fiction_GUI\history"
  ${EndIf}
  ${If} $0 == "$FxLangZhTw"
    StrCpy $FxLangKey "zh-TW"
  ${ElseIf} $0 == "$FxLangEn"
    StrCpy $FxLangKey "en"
  ${ElseIf} $0 == "$FxLangJa"
    StrCpy $FxLangKey "ja"
  ${Else}
    StrCpy $FxLangKey "zh-CN"
  ${EndIf}
  ; 目录先建出来，程序第一次打开就能直接用
  CreateDirectory "$FxExportDir"
  CreateDirectory "$FxHistoryDir"
  ; 把选择写给程序（程序第一次运行时读它当默认值）
  ; 用 UTF-16LE 写：路径里带中文 / 日文也不会变乱码（FileWrite 走的是系统 ANSI 代码页）
  CreateDirectory "$APPDATA\Adaa的小说工坊"
  FileOpen $0 "$APPDATA\Adaa的小说工坊\install-prefs.txt" w
  FileWriteUTF16LE $0 "$FxExportDir$\r$\n"
  FileWriteUTF16LE $0 "$FxHistoryDir$\r$\n"
  FileWriteUTF16LE $0 "$FxLangKey$\r$\n"
  FileClose $0
  SetShellVarContext all
FunctionEnd

!macro customPageAfterChangeDir
  Page custom fxPathsPageCreate fxPathsPageLeave
!macroend
!endif

; ---------------- 快捷方式 / 卸载项名称 ----------------
; 安装完成后，把开始菜单和桌面快捷方式改成「安装时选的界面语言」下的软件名；
; exe 文件名和安装目录不动（它们和系统无关，改了反而容易出问题）。
!macro customInstall
  !ifdef MENU_FILENAME
    StrCpy $0 "$SMPROGRAMS\${MENU_FILENAME}\${SHORTCUT_NAME}.lnk"
    StrCpy $1 "$SMPROGRAMS\${MENU_FILENAME}\$FxAppName.lnk"
  !else
    StrCpy $0 "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    StrCpy $1 "$SMPROGRAMS\$FxAppName.lnk"
  !endif
  ${If} $0 != $1
  ${AndIf} ${FileExists} "$0"
    Rename "$0" "$1"
  ${EndIf}
  ; 装完自动启动用的是这个路径，上面改了名就跟着改
  ${If} $launchLink == $0
    StrCpy $launchLink "$1"
  ${EndIf}
  StrCpy $0 "$DESKTOP\${SHORTCUT_NAME}.lnk"
  StrCpy $1 "$DESKTOP\$FxAppName.lnk"
  ${If} $0 != $1
  ${AndIf} ${FileExists} "$0"
    Rename "$0" "$1"
  ${EndIf}
  ; 「应用和功能」里显示的名字
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayName "$FxUninstName"
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

; 四种语言下的快捷方式都清一遍：卸载时的系统语言不一定等于安装时选的语言
!macro fxDeleteShortcut name
  Delete "$SMPROGRAMS\${name}.lnk"
  Delete "$DESKTOP\${name}.lnk"
  !ifdef MENU_FILENAME
    Delete "$SMPROGRAMS\${MENU_FILENAME}\${name}.lnk"
  !endif
!macroend

; ---------------- 卸载 ----------------
!macro customUnInit
  !insertmacro fxPickLanguage
  SendMessage $HWNDPARENT 0x000C 0 "STR:$FxUninstName $FxAppName"
  ; 升级替换时会带 --updated 参数：这种情况不弹、不卡
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    Return
  ${EndIf}

  ; 优先显示程序里设置过的实际目录；读不到就用默认位置
  SetShellVarContext current
  StrCpy $FxExportDir "$DOCUMENTS\fiction_GUI\output"
  StrCpy $FxHistoryDir "$DOCUMENTS\fiction_GUI\history"
  IfFileExists "$APPDATA\Adaa的小说工坊\install-prefs.txt" 0 fxNoPrefs
  FileOpen $0 "$APPDATA\Adaa的小说工坊\install-prefs.txt" r
  FileReadUTF16LE $0 $1
  FileReadUTF16LE $0 $2
  FileClose $0
  ${If} $1 != ""
    StrCpy $FxExportDir $1 -2
  ${EndIf}
  ${If} $2 != ""
    StrCpy $FxHistoryDir $2 -2
  ${EndIf}
  fxNoPrefs:
  SetShellVarContext all

  ${If} $LANGUAGE == 2052
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "确定要卸载吗？$\r$\n$\r$\n卸载会删除程序文件及安装目录下所有内容。$\r$\n如果导出的 JSON 文件和历史版本不在安装目录下，卸载不会删除，请手动清理。$\r$\n    当前导出路径：$FxExportDir$\r$\n    当前历史版本保存路径：$FxHistoryDir$\r$\n$\r$\n是否继续卸载？" IDYES +2
    Abort
  ${ElseIf} $LANGUAGE == 1028
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "確定要解除安裝嗎？$\r$\n$\r$\n會刪除程式檔案與安裝目錄下的所有內容。$\r$\n如果匯出的 JSON 檔與歷史版本不在安裝目錄下，解除安裝不會刪除，請自行清理。$\r$\n    目前匯出路徑：$FxExportDir$\r$\n    目前歷史版本儲存路徑：$FxHistoryDir$\r$\n$\r$\n要繼續嗎？" IDYES +2
    Abort
  ${ElseIf} $LANGUAGE == 1041
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "アンインストールしますか？$\r$\n$\r$\nプログラム本体とインストール先フォルダの中身を削除します。$\r$\n書き出した JSON と履歴がインストール先にない場合、それらは削除されません。手動で削除してください。$\r$\n    書き出し先：$FxExportDir$\r$\n    履歴の保存先：$FxHistoryDir$\r$\n$\r$\n続行しますか？" IDYES +2
    Abort
  ${Else}
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "Uninstall this app?$\r$\n$\r$\nThis removes the program files and everything inside the install folder.$\r$\nExported JSON files and history versions outside that folder are NOT deleted — please clean them up manually.$\r$\n    Export path: $FxExportDir$\r$\n    History path: $FxHistoryDir$\r$\n$\r$\nContinue?" IDYES +2
    Abort
  ${EndIf}
!macroend

; 卸载后把整个安装目录删干净（含运行时生成的 output / history 子文件夹、以及卸载器自身）
!macro customUnInstall
  ; 快捷方式按安装时选的语言改过名，这里四种名字都清一遍
  !insertmacro fxDeleteShortcut "${SHORTCUT_NAME}"
  !insertmacro fxDeleteShortcut "Adaa的小说工坊"
  !insertmacro fxDeleteShortcut "Adaa的小說工坊"
  !insertmacro fxDeleteShortcut "Adaaの小説工房"
  !insertmacro fxDeleteShortcut "Adaa's Fiction Workshop"
  !ifdef MENU_FILENAME
    RMDir "$SMPROGRAMS\${MENU_FILENAME}"
  !endif
  RMDir /r "$INSTDIR"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
!macroend
