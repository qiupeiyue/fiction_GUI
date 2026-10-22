@echo off
chcp 65001 >nul
cd /d "%~dp0wrap2exe"
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_BUILDER_CACHE=%TEMP%\fiction_gui-electron-builder-cache"

echo ================================================
echo   AdaA 的小说工坊 —— 一键发版
echo   自动：加版本号 → 同步源码 → 打包 → 上传 GitHub
echo ================================================
echo.

call npm run release

echo.
echo ================================================
echo   结束。
echo   如果上面出现红色报错，请把整个窗口截图发给我。
echo ================================================
pause
