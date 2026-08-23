@echo off
setlocal
rem Enter the project root (directory of this .bat)
cd /d "%~dp0"

rem Prefer PowerShell 7 (pwsh), otherwise fall back to Windows PowerShell 5.1
where pwsh >nul 2>nul
if not errorlevel 1 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-form-studio.ps1" %*
    goto :finish
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-form-studio.ps1" %*

:finish
echo.
pause
endlocal
