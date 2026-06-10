"""Smoke tests: main.py imports cleanly and all expected routes are mounted.

Catches silent NameError/ImportError regressions and unmounted routers
immediately in CI.  DB setup is handled by conftest.py.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import main


# ── 1. Import smoke test ──────────────────────────────────────────────────────

def test_main_is_fastapi_app():
    assert isinstance(main.app, FastAPI)


# ── 2. Route-presence assertions (one per router / inline group) ─────────────

def _route_paths() -> set[str]:
    return {r.path for r in main.app.routes if hasattr(r, "path")}


def _has_prefix(paths: set[str], prefix: str) -> bool:
    return any(
        p == prefix or p.startswith(prefix + "/") or p.startswith(prefix + "{")
        for p in paths
    )


@pytest.mark.parametrize("prefix", [
    "/api/compile",      # inline POST in main.py
    "/api/parts",        # parts_router (prefix /api/parts) + inline GET
    "/api/sequence",     # sequence_router
    "/api/simulate",     # simulation_router (prefix /api, route /simulate)
    "/api/llm",          # llm_router
    "/api/chem",         # chemistry_router
    "/api/primers",      # primers_router
    "/api/protocol",     # protocol_router
    "/api/pathway",      # pathway_router
    "/api/experiments",  # experiments_router
    "/api/git",          # git_router
    "/api/circuit/to-dsl",  # inline POST in main.py
    "/api/export",       # inline POST in main.py
    "/api/order",        # inline POST in main.py
    "/api/assembly",     # inline POST in main.py
])
def test_route_prefix_mounted(prefix: str):
    paths = _route_paths()
    assert _has_prefix(paths, prefix), (
        f"No route found with prefix {prefix!r}. Registered paths: {sorted(paths)}"
    )


# ── 3. HTTP smoke tests ───────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_compile_happy_path(client):
    r = client.post("/api/compile", json={"text": "express GFP under IPTG"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "circuit" in body
    assert "simulation" in body


# ── 4. Kept from original file ───────────────────────────────────────────────

def test_circuit_to_dsl_returns_dsl_string(client):
    payload = {
        "nodes": [
            {"id": "ind1", "type": "inducer", "label": "IPTG"},
            {"id": "rep1", "type": "reporter", "label": "GFP", "reporter": True},
        ],
        "edges": [
            {"source": "ind1", "target": "rep1", "kind": "expression"},
        ],
    }
    r = client.post("/api/circuit/to-dsl", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "dsl" in body
    assert isinstance(body["dsl"], str)
