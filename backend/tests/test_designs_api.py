"""Tests for the designs persistence API (save / list / version / load / export).

Uses FastAPI's TestClient against a temp SQLite DB and the deterministic parser
(LLM_PARSER=off), so no network or API key is needed.

DESIGNS_DB / LLM_PARSER are set *before* importing the app so storage.db binds its
engine to the throwaway database -- this module is the only importer of storage/main.
"""

import os
import tempfile

_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ["DESIGNS_DB"] = _TMP_DB.name
os.environ["LLM_PARSER"] = "off"
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:  # startup hook creates the schema
        yield c
    os.unlink(_TMP_DB.name)


def _compile(client, text="Express GFP when IPTG is present"):
    res = client.post("/api/compile", json={"text": text})
    assert res.status_code == 200, res.text
    return res.json()


def test_compile_includes_validation(client):
    body = _compile(client)
    assert "validation" in body
    assert body["validation"]["ok"] is True


def test_save_list_version_and_load(client):
    compiled = _compile(client)
    req = {"text": "Express GFP when IPTG is present"}

    created = client.post(
        "/api/designs", json={"name": "My circuit", "request": req, "response": compiled}
    ).json()
    design_id = created["id"]
    assert created["latest_version"] == 1

    # second version
    v2 = client.post(
        f"/api/designs/{design_id}/versions", json={"request": req, "response": compiled}
    ).json()
    assert v2["version_no"] == 2

    listing = client.get("/api/designs").json()
    assert any(d["id"] == design_id and d["latest_version"] == 2 for d in listing)

    loaded = client.get(f"/api/designs/{design_id}/versions/1").json()
    assert loaded["response"]["spec"]["output"] == "GFP"


def test_export_saved_version(client):
    compiled = _compile(client)
    created = client.post(
        "/api/designs",
        json={"name": "X", "request": {"text": "x"}, "response": compiled},
    ).json()
    res = client.get(
        f"/api/designs/{created['id']}/versions/1/export", params={"format": "fasta"}
    )
    assert res.status_code == 200
    assert res.headers["content-disposition"].endswith('.fasta"')
    assert res.text.startswith(">")


def test_inline_export(client):
    compiled = _compile(client)
    res = client.post("/api/export", params={"format": "json"}, json=compiled)
    assert res.status_code == 200
    assert res.json()["format"] == "bio-pro-design-bundle/v1"


def test_unknown_design_404(client):
    assert client.get("/api/designs/99999").status_code == 404
