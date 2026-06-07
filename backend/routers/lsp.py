"""LSP WebSocket proxy router.

Bridges VS Code language client extensions (running in the browser) to locally
installed language server processes via JSON-RPC over WebSocket.

Flow:
  1. Browser extension connects to  ws://localhost:8000/api/lsp/{languageId}
  2. Backend looks up the command for that languageId in LSP_REGISTRY.
  3. Backend spawns (or re-uses) the language server process.
  4. JSON-RPC messages are relayed bidirectionally.

Adding a language server:
  Set the environment variable LSP_<LANG_ID_UPPER>=<command>
  e.g.  LSP_PYTHON=pylsp
        LSP_SBOL=sbol-language-server --stdio

The registry also has built-in defaults for common bio/chemistry tools.
"""

import asyncio
import json
import logging
import os
import shlex
import subprocess
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
log = logging.getLogger(__name__)

# ── Language server command registry ──────────────────────────────────────────
# Maps languageId → shell command string.
# Environment variables LSP_<LANG>  override these at runtime.

_BUILTIN_COMMANDS: dict[str, str] = {
    "python":          "pylsp",
    "sbol":            "sbol-language-server --stdio",
    "genbank":         "biotools-lsp --stdio",
    "fasta":           "biotools-lsp --stdio",
    "json":            "vscode-json-languageserver --stdio",
    "yaml":            "yaml-language-server --stdio",
    "markdown":        "marksman",
}


def _get_lsp_command(language_id: str) -> Optional[str]:
    env_key = f"LSP_{language_id.upper().replace('-', '_')}"
    if env_val := os.environ.get(env_key):
        return env_val
    return _BUILTIN_COMMANDS.get(language_id)


# ── Active server processes ────────────────────────────────────────────────────
# Keyed by language_id.  Each value is an asyncio subprocess.
_servers: dict[str, asyncio.subprocess.Process] = {}


async def _get_or_spawn(language_id: str) -> asyncio.subprocess.Process:
    if language_id in _servers:
        proc = _servers[language_id]
        # Check if process is still alive.
        if proc.returncode is None:
            return proc
        del _servers[language_id]

    cmd = _get_lsp_command(language_id)
    if not cmd:
        raise ValueError(f"No language server registered for '{language_id}'")

    parts = shlex.split(cmd)
    log.info("[lsp-proxy] Spawning language server for %s: %s", language_id, cmd)
    proc = await asyncio.create_subprocess_exec(
        *parts,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _servers[language_id] = proc
    return proc


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/api/lsp/{language_id}")
async def lsp_proxy(websocket: WebSocket, language_id: str):
    """
    WebSocket ↔ stdio relay for LSP language servers.

    The browser sends JSON-RPC messages (as text frames).
    This endpoint forwards them to the language server's stdin and relays
    the server's stdout back as text frames to the browser.
    """
    await websocket.accept()
    log.info("[lsp-proxy] Client connected for language: %s", language_id)

    try:
        proc = await _get_or_spawn(language_id)
    except ValueError as exc:
        await websocket.send_text(json.dumps({
            "jsonrpc": "2.0", "id": None,
            "error": {"code": -32603, "message": str(exc)},
        }))
        await websocket.close()
        return

    # Run browser→server and server→browser relays concurrently.
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(_relay_browser_to_server(websocket, proc, language_id))
            tg.create_task(_relay_server_to_browser(proc, websocket, language_id))
    except* WebSocketDisconnect:
        log.info("[lsp-proxy] Client disconnected for language: %s", language_id)
    except* Exception as eg:
        for exc in eg.exceptions:
            log.error("[lsp-proxy] Error in %s relay: %s", language_id, exc)
    finally:
        log.info("[lsp-proxy] Session ended for language: %s", language_id)


async def _relay_browser_to_server(
    ws: WebSocket,
    proc: asyncio.subprocess.Process,
    language_id: str,
) -> None:
    """Forward messages from the WebSocket client to the LSP server's stdin."""
    while True:
        try:
            text = await ws.receive_text()
        except WebSocketDisconnect:
            break

        # LSP stdio transport uses Content-Length framing.
        encoded = text.encode("utf-8")
        header = f"Content-Length: {len(encoded)}\r\n\r\n".encode("ascii")
        try:
            proc.stdin.write(header + encoded)
            await proc.stdin.drain()
        except (BrokenPipeError, ConnectionResetError):
            log.warning("[lsp-proxy] %s stdin closed unexpectedly", language_id)
            break


async def _relay_server_to_browser(
    proc: asyncio.subprocess.Process,
    ws: WebSocket,
    language_id: str,
) -> None:
    """Forward LSP stdout (Content-Length framed JSON-RPC) back to the WebSocket."""
    while True:
        try:
            # Read "Content-Length: NNN\r\n\r\n"
            header_line = await proc.stdout.readline()
            if not header_line:
                break

            header_str = header_line.decode("utf-8", errors="replace").strip()
            if not header_str.startswith("Content-Length:"):
                continue  # skip unexpected header lines

            content_length = int(header_str.split(":")[1].strip())

            # Consume the blank separator line.
            await proc.stdout.readline()

            body = await proc.stdout.readexactly(content_length)
            await ws.send_text(body.decode("utf-8", errors="replace"))

        except asyncio.IncompleteReadError:
            log.info("[lsp-proxy] %s stdout closed (server exited)", language_id)
            break
        except Exception as exc:
            log.error("[lsp-proxy] %s stdout read error: %s", language_id, exc)
            break
