"""PyInstaller entry point for the bundled backend server.

Windows frozen apps require multiprocessing.freeze_support() before anything else.
The DESIGNS_DB env var is set here so the SQLite file lands in %APPDATA%/bio-pro/
when launched by Tauri (not overridden by tests or dev uvicorn invocations).
"""
import multiprocessing
import sys

if __name__ == "__main__":
    multiprocessing.freeze_support()

    import os
    import pathlib

    if not os.environ.get("DESIGNS_DB"):
        base = pathlib.Path(os.environ.get("APPDATA", str(pathlib.Path.home())))
        db_dir = base / "bio-pro"
        db_dir.mkdir(parents=True, exist_ok=True)
        os.environ["DESIGNS_DB"] = str(db_dir / "designs.db")

    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="warning")
