@echo off
set ELECTRON_RUN_AS_NODE=
set "ELECTRON_EXE=%~dp0..\..\wrap2exe\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON_EXE%" (
  echo Electron not found. Please keep the program folder intact.
  pause
  exit /b 1
)

start "" "%ELECTRON_EXE%" "%~dp0main.js"
exit /b 0
