@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  Bio-Pro Windows build
echo  Requires: Python 3.11+, Node 18+, Rust + Cargo, cargo-tauri
echo ============================================================

:: ── 1. PyInstaller backend bundle ──────────────────────────────────────────
echo.
echo [1/4] Installing Python deps and building backend bundle...
cd /d "%~dp0..\src"
pip install -r requirements.txt || goto :error
pip install pyinstaller        || goto :error
pyinstaller bio_pro.spec --clean --noconfirm || goto :error

:: ── 2. Copy onedir bundle into Tauri resource slot ─────────────────────────
echo.
echo [2/4] Copying backend bundle to src-tauri/backend-server-dist...
set SRC=%~dp0..\src\dist\backend-server
set DST=%~dp0..\src-tauri\backend-server-dist\backend-server

:: Safety guard: refuse to rmdir if the path variable is empty or suspiciously short.
if "%DST%"=="" (
    echo ERROR: DST path is empty — aborting to avoid deleting the wrong directory.
    goto :error
)
:: Require the path to contain "backend-server-dist" to prevent accidental broad deletes.
echo %DST% | findstr /i "backend-server-dist" >nul || (
    echo ERROR: DST path does not contain expected marker "backend-server-dist". Aborting.
    goto :error
)
if exist "%DST%" rmdir /s /q "%DST%"
xcopy /E /I /Y "%SRC%" "%DST%" || goto :error

:: ── 3. Frontend npm install (handles cross-env + @tauri-apps/cli) ──────────
echo.
echo [3/4] Installing frontend deps...
cd /d "%~dp0..\frontend"
npm install || goto :error

:: ── 4. Tauri build (triggers vite build via beforeBuildCommand) ─────────────
echo.
echo [4/4] Building Tauri NSIS installer...
cd /d "%~dp0..\src-tauri"
set VITE_API_BASE_URL=http://127.0.0.1:8000
cargo tauri build || goto :error

echo.
echo ============================================================
echo  SUCCESS
echo  Installer: src-tauri\target\release\bundle\nsis\
echo ============================================================
goto :eof

:error
echo.
echo *** BUILD FAILED (exit code %errorlevel%) ***
exit /b %errorlevel%
