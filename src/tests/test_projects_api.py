"""Tests for the Projects API: CRUD, artifact attach, and cascade linking.

Uses a throwaway SQLite DB and the rule-based (non-LLM) compiler path.
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

import main  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:   # lifespan creates schema
        yield c
    os.unlink(_TMP_DB.name)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compile(client, text="Express GFP when IPTG is present"):
    res = client.post("/api/compile", json={"text": text})
    assert res.status_code == 200, res.text
    return res.json()


def _make_project(client, name="Proj-A", description="test project"):
    res = client.post("/api/projects", json={"name": name, "description": description})
    assert res.status_code == 200, res.text
    return res.json()


def _make_design(client, project_id=None, name="Circuit-1"):
    compiled = _compile(client)
    body = {"name": name, "request": {"text": "Express GFP when IPTG is present"}, "response": compiled}
    if project_id:
        body["project_id"] = project_id
    res = client.post("/api/designs", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def _make_simulation(client, project_id=None, design_id=None):
    body = {"label": "test run", "mode": "ode", "organism": "ecoli",
            "params": {}, "summary": {"peak": 1.0}}
    if project_id:
        body["project_id"] = project_id
    if design_id:
        body["design_id"] = design_id
    res = client.post("/api/simulations", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def _make_experiment(client, project_id=None, design_id=None, design_version_no=None):
    body = {"title": "Exp-1", "exp_type": "expression",
            "columns": ["Sample", "GFP"], "rows": [["A1", "100"]]}
    if project_id:
        body["project_id"] = project_id
    if design_id:
        body["design_id"] = design_id
    if design_version_no:
        body["design_version_no"] = design_version_no
    res = client.post("/api/experiments", json=body)
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

def test_create_project(client):
    p = _make_project(client, "Alpha", "first project")
    assert p["id"] > 0
    assert p["name"] == "Alpha"
    assert p["description"] == "first project"
    assert "created_at" in p


def test_list_projects(client):
    _make_project(client, "Beta")
    projects = client.get("/api/projects").json()
    names = [p["name"] for p in projects]
    assert "Alpha" in names
    assert "Beta" in names


def test_get_project_includes_empty_artifacts(client):
    p = _make_project(client, "Empty")
    detail = client.get(f"/api/projects/{p['id']}").json()
    assert detail["designs"] == []
    assert detail["simulations"] == []
    assert detail["experiments"] == []
    assert detail["orders"] == []


def test_update_project(client):
    p = _make_project(client, "OldName")
    updated = client.put(f"/api/projects/{p['id']}", json={"name": "NewName", "description": "updated"}).json()
    assert updated["name"] == "NewName"
    assert updated["description"] == "updated"


def test_delete_project(client):
    p = _make_project(client, "ToDelete")
    res = client.delete(f"/api/projects/{p['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/projects/{p['id']}").status_code == 404


def test_get_missing_project_returns_404(client):
    assert client.get("/api/projects/999999").status_code == 404


# ---------------------------------------------------------------------------
# Design created with project_id flows through
# ---------------------------------------------------------------------------

def test_design_carries_project_id(client):
    p = _make_project(client, "DesignHolder")
    d = _make_design(client, project_id=p["id"], name="GFP-IPTG")
    assert d["project_id"] == p["id"]


def test_project_detail_shows_linked_design(client):
    p = _make_project(client, "WithDesign")
    _make_design(client, project_id=p["id"], name="LinkedCircuit")
    detail = client.get(f"/api/projects/{p['id']}").json()
    assert len(detail["designs"]) >= 1
    assert any(d["name"] == "LinkedCircuit" for d in detail["designs"])


# ---------------------------------------------------------------------------
# Simulation attach
# ---------------------------------------------------------------------------

def test_simulation_carries_project_id(client):
    p = _make_project(client, "SimProj")
    s = _make_simulation(client, project_id=p["id"])
    assert s["project_id"] == p["id"]


def test_attach_simulation_via_endpoint(client):
    p = _make_project(client, "AttachSim")
    s = _make_simulation(client)
    res = client.put(f"/api/projects/{p['id']}/simulations/{s['id']}")
    assert res.json()["ok"] is True
    detail = client.get(f"/api/projects/{p['id']}").json()
    assert any(r["id"] == s["id"] for r in detail["simulations"])


# ---------------------------------------------------------------------------
# Experiment attach with design version linking
# ---------------------------------------------------------------------------

def test_experiment_carries_project_and_design_version(client):
    p = _make_project(client, "ExpProj")
    d = _make_design(client, project_id=p["id"], name="ExpCircuit")
    exp = _make_experiment(client, project_id=p["id"], design_id=d["id"], design_version_no=1)
    assert exp["project_id"] == p["id"]
    assert exp["design_id"] == d["id"]
    assert exp["design_version_no"] == 1


def test_attach_experiment_via_endpoint(client):
    p = _make_project(client, "AttachExp")
    exp = _make_experiment(client)
    res = client.put(f"/api/projects/{p['id']}/experiments/{exp['id']}")
    assert res.json()["ok"] is True
    detail = client.get(f"/api/projects/{p['id']}").json()
    assert any(e["id"] == exp["id"] for e in detail["experiments"])


def test_experiment_update_preserves_design_version(client):
    p = _make_project(client, "UpdateExp")
    d = _make_design(client, project_id=p["id"])
    exp = _make_experiment(client, project_id=p["id"], design_id=d["id"], design_version_no=1)
    updated = client.put(
        f"/api/experiments/{exp['id']}",
        json={**exp, "title": "Updated Title", "design_version_no": 1},
    ).json()
    assert updated["title"] == "Updated Title"
    assert updated["design_version_no"] == 1


# ---------------------------------------------------------------------------
# Saved orders
# ---------------------------------------------------------------------------

def test_save_and_list_order(client):
    p = _make_project(client, "OrderProj")
    res = client.post("/api/projects/orders", json={
        "project_id": p["id"], "vendor": "IDT", "fragment_count": 3,
        "estimated_cost_usd": 42.50, "sequences": ["ATGC", "GCTA"],
    })
    assert res.status_code == 200
    order = res.json()
    assert order["vendor"] == "IDT"
    assert order["project_id"] == p["id"]

    orders = client.get(f"/api/projects/orders/list?project_id={p['id']}").json()
    assert any(o["id"] == order["id"] for o in orders)

    detail = client.get(f"/api/projects/{p['id']}").json()
    assert any(o["id"] == order["id"] for o in detail["orders"])


# ---------------------------------------------------------------------------
# Cascade: project detail shows all linked artifact types together
# ---------------------------------------------------------------------------

def test_full_cascade_linking(client):
    p = _make_project(client, "FullProject", "end-to-end linkage test")
    d = _make_design(client, project_id=p["id"], name="FullCircuit")
    s = _make_simulation(client, project_id=p["id"], design_id=d["id"])
    exp = _make_experiment(client, project_id=p["id"], design_id=d["id"], design_version_no=1)

    detail = client.get(f"/api/projects/{p['id']}").json()
    assert len(detail["designs"]) >= 1
    assert len(detail["simulations"]) >= 1
    assert len(detail["experiments"]) >= 1

    # design summary carries project_id
    assert all(d_item["project_id"] == p["id"] for d_item in detail["designs"])

    # sim summary carries project_id
    assert all(s_item["project_id"] == p["id"] for s_item in detail["simulations"])

    # experiment carries both project and design version
    exp_items = [e for e in detail["experiments"] if e["id"] == exp["id"]]
    assert exp_items[0]["design_version_no"] == 1
