@echo off
rem Run the app on this computer with one click. Nothing has to be installed first.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
set RESULT=%ERRORLEVEL%
rem Keep the window open after a double click (no arguments), so the result can be read.
if "%~1"=="" pause
exit /b %RESULT%
