@echo off
cd /d "%~dp0"
echo ====================================================
echo Starting lab_note (Port 8002)...
echo ====================================================

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" run.py
) else (
    echo [ERROR] Virtual environment not found. Please setup .venv first.
    pause
)
