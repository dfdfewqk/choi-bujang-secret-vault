@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0on-client\tools\horse-oneclick.ps1" %*
set "exitcode=%errorlevel%"
if not "%exitcode%"=="0" (
  echo.
  echo HORSE could not start. Check the message above.
  echo Existing files and submitted projects were not changed.
  pause
)
endlocal & exit /b %exitcode%
