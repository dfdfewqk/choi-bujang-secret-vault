@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0on-client\tools\horse-oneclick.ps1"
if errorlevel 1 (
  echo.
  echo HORSE did not start. Please review the message above.
  pause
)
endlocal
