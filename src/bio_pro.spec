# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Bio-Pro backend server.
# Run from the src/ directory:
#   pyinstaller bio_pro.spec --clean --noconfirm
#
# Output: dist/backend-server/  (onedir layout)
# Then copy that directory to src-tauri/backend-server-dist/backend-server/

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# SPECPATH is set by PyInstaller to the directory containing this spec file (src/).
backend_dir = Path(SPECPATH)

# Collect all data, binaries, and hidden imports from heavy scientific packages.
# collect_all() handles DLLs, .pyd extensions, and package data automatically.
scipy_datas,    scipy_bins,    scipy_hidden    = collect_all("scipy")
numpy_datas,    numpy_bins,    numpy_hidden    = collect_all("numpy")
bio_datas,      bio_bins,      bio_hidden      = collect_all("Bio")
sbol3_datas,    sbol3_bins,    sbol3_hidden    = collect_all("sbol3")
anthropic_datas,anthropic_bins,anthropic_hidden = collect_all("anthropic")
rdflib_datas,   rdflib_bins,   rdflib_hidden   = collect_all("rdflib")
mcp_datas,      mcp_bins,      mcp_hidden      = collect_all("mcp")
httpx_datas,    httpx_bins,    httpx_hidden     = collect_all("httpx")

all_datas = (
    # Application data files
    [
        (str(backend_dir / "data" / "parts.json"), "data"),
    ]
    + scipy_datas + numpy_datas + bio_datas
    + sbol3_datas + anthropic_datas + rdflib_datas
    + mcp_datas + httpx_datas
)

all_binaries = (
    scipy_bins + numpy_bins + bio_bins
    + sbol3_bins + anthropic_bins + rdflib_bins
    + mcp_bins + httpx_bins
)

uvicorn_hidden = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan",
    "uvicorn.lifespan.off",
    "uvicorn.lifespan.on",
]

sqlalchemy_hidden = [
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.pysqlite",
]

# Seed data is imported lazily inside init_db(); name it explicitly so the
# onedir bundle includes it.
app_hidden = [
    "modules.parts.seed_parts",
]

all_hidden = (
    uvicorn_hidden + sqlalchemy_hidden + app_hidden
    + scipy_hidden + numpy_hidden + bio_hidden
    + sbol3_hidden + anthropic_hidden + rdflib_hidden
    + mcp_hidden + httpx_hidden
)

a = Analysis(
    [str(backend_dir / "server_entry.py")],
    pathex=[str(backend_dir)],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX corrupts scipy/numpy DLLs on Windows
    console=False,      # No console window; Tauri launches it silently
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="backend-server",
)
