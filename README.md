# 🧬 Biological Compiler (BioIDE)

A desktop **IDE for synthetic biology and chemistry**, modeled after VS Code. Describe a
biological function in plain language (or via a structured form), and the tool:

1. **Parses** the intent into a formal biological specification (`IntentSpec`)
2. **Assembles** a genetic circuit (promoters, RBS, genes, regulators, terminators)
   using transparent rule-based logic — no LLM required
3. **Validates** the circuit against design rules (leakiness, burden, oscillation, …)
4. **Simulates** behavior over time with an ODE model (Hill kinetics) and, optionally,
   a Gillespie stochastic model
5. **Visualizes** the result as a circuit node-graph + protein-expression plot, and
   **exports** to GenBank / FASTA / SBOL

> Example: *"Express GFP when IPTG is present"* → assembles `pCon → LacI ⊣ pLac → GFP`
> with `IPTG ⊣ LacI`, then simulates GFP rising after IPTG is added.

Beyond the compiler, BioIDE bundles chemistry (formula/SMILES properties, pH/buffer,
titration), sequence tooling (alignment, primers, codon optimization, CRISPR guides,
plasmid maps), flux-balance analysis, wet-lab protocol + assay simulation, experiment
tracking, design versioning, and a Git-backed source-control view — all behind a
VS Code-style shell with a command palette, activity bar, and resizable panels.

## What's implemented

- **57 characterized genetic parts** in [`src/data/parts.json`](src/data/parts.json)
  (16 promoters, 17 CDS, 6 RBS, 7 terminators, 8 inducers, 2 degradation tags,
  1 insulator), seeded into SQLite on first run.
- **15 circuit patterns** (see below).
- **9 reporters**: GFP, RFP, YFP, mCherry, mTurquoise2, iRFP713, LacZ, luciferase, BFP.
- **8 catalogued inducers**; **6 are wired to inducible promoter systems** in the
  compiler: IPTG (pLac/LacI), aTc (pTet/TetR), arabinose (pBAD/AraC), AHL (pLuxR/LuxR),
  rhamnose (pRha/RhaS), vanillic acid (pVan/VanR). doxycycline and galactose are in the
  parts catalog but not yet mapped to a compiler system.
- Host organisms: **E. coli, yeast, mammalian** (host-specific rate scaling).
- Optional **LLM parser layer** (Anthropic / OpenAI / Google / Mistral / Ollama) for
  language → spec translation only; all biology logic stays deterministic. Off by
  default; biology runs fully locally without any API key.

### Circuit patterns (15)

`inducible_expression`, `repressible_expression`, `constitutive_expression`,
`not_gate`, `logic_and`, `logic_or`, `logic_nand`, `logic_nor`,
`combinatorial_logic`, `toggle_switch`, `negative_feedback`, `positive_feedback`,
`feed_forward_loop`, `band_pass_filter`, `oscillator`.

The five base patterns (inducible/repressible/constitutive/not_gate and the AND/OR
gates) are detected from inducer + presence + `and`/`or` keywords; the remaining
patterns are matched from keywords in
[`rules.py` `PATTERN_KEYWORDS`](src/modules/compiler/rules.py).

## Architecture

Feature-based monorepo: each `src/modules/<feature>/` folder co-locates that feature's
FastAPI code (`api.py` + logic) **and** its React UI (`.jsx`), with cross-cutting code
under `src/shared/` and the VS Code-style shell under `src/shell/`.

```
src/                       Python · FastAPI · scipy  +  React · Vite · React Flow
  main.py                  FastAPI app entry (registers every module router)
  mcp_server.py            MCP (Model Context Protocol) server — compiler as Claude tools
  server_entry.py          frozen-app entry used by the bundled (PyInstaller) backend
  data/parts.json          genetic parts library (seeded into data/designs.db)
  modules/
    compiler/              parser → assembler → validate + rules + LLM layer; GoalInput,
                           CircuitEditor, CircuitDiagram, SpecPanel, DesignsPanel
    simulation/            ode.py / stochastic.py + SimulationPlot, ParameterSweep, …
    chemistry/             formula/SMILES properties, pH/buffer/titration, reaction ODE
    parts/ sequence/ export/ assembly/ ordering/ citations/ protocol/ pathway/
    primers/ codon/ crispr/ seqmap/ align/ assays/ experiments/ git/ projects/
    templates/ welcome/ llm/ settings/
  shared/
    db/                    SQLAlchemy engine + models + repo (SQLite)
    schemas/               Pydantic schemas (shared request/response contracts)
    lib/                   biopro-language, vscode-shim, api client (client.js), templates
    stores/                Zustand stores (one per domain)
    ui/                    cross-module React components (explorer, tabs, terminal, …)
  shell/                   React app shell: ActivityBar, sidebars, EditorArea, StatusBar,
                           CommandPalette, editorRegistry, commands
  styles/                  design-system tokens.css + base.css + components.css
src-tauri/                 Rust · Tauri native desktop shell (NSIS installer on Windows)
```

The compiler runs four transparent stages, each emitting a human-readable trace shown
in the UI's **Compiler trace** panel:

| Stage | File | Role |
|-------|------|------|
| Parse | [`parser.py`](src/modules/compiler/parser.py) | text / form → `IntentSpec` |
| Assemble | [`assembler.py`](src/modules/compiler/assembler.py) | `IntentSpec` → circuit nodes + edges |
| Validate | [`validate.py`](src/modules/compiler/validate.py) | structural / compatibility / semantic / biosafety checks |
| Simulate | [`ode.py`](src/modules/simulation/ode.py) | ODE time-series per pattern |

Rules are pure data in [`rules.py`](src/modules/compiler/rules.py) (inducer→system
table, toggle/repressilator topologies, cross-reactivity matrix). The optional LLM path
(`llm_parser.py`, `llm_compiler.py`, `llm_providers.py`) only replaces the *parse* stage.

### Module reference

| Module | Router prefix | What it does |
|--------|---------------|--------------|
| compiler | `/api` (compile, lint, circuit) | parse → assemble → validate; reverse-compile circuit → DSL |
| simulation | `/api` | ODE, dose-response, sensitivity, sweep, stochastic; run history |
| parts | `/api/parts` | parts library, custom parts, GenBank import, cross-reactivity grid |
| sequence | `/api/sequence` | parse, revcomp, translate, GC, ORFs, restriction; `/api/lint` LSP |
| chemistry | `/api/chem` | formula/SMILES properties, MS isotopes, reaction SMILES, pH/buffer/titration |
| export | `/api/export` | GenBank, FASTA, SBOL, JSON bundle |
| assembly | `/api/assembly` | Gibson / Golden Gate protocols (+ PDF) |
| ordering | `/api/order` | IDT / Twist order-ready fragments |
| citations | (in `/api/compile`) | CrossRef DOI lookup per part |
| protocol | `/api/protocol` | wet-lab protocol + cloning map |
| pathway | `/api/pathway` | flux-balance analysis (scipy linprog) + templates |
| primers | `/api/primers` | PCR primer design (SantaLucia 1998 nearest-neighbor Tm) |
| codon | `/api/codon` | codon optimization |
| crispr | `/api/crispr` | gRNA design: PAM enumeration, on/off-target scoring |
| seqmap | `/api/seqmap` | plasmid map layout |
| align | `/api/align` | Needleman-Wunsch / Smith-Waterman / center-star MSA |
| assays | `/api/assays` | flow cytometry, plate reader, qPCR, gel readout simulation |
| experiments | `/api/experiments` | experiment notebook CRUD + sim-vs-data fit |
| git | `/api/git` | repo init/status/stage/commit/log/diff/branch/push/pull |
| projects | `/api/projects` | projects grouping designs / sims / experiments / orders |
| llm | `/api/llm` | test API key, suggestions for ambiguous goals |

## Running

The browser dev workflow is **backend (port 8000) + frontend (port 5173)**. The desktop
app (Tauri) and the MCP server are described after.

### Backend (port 8000)

```bash
cd src
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The DB schema is created and parts are seeded automatically on first request
(`init_db()` in the FastAPI lifespan). Set `LLM_PARSER=off` to force the deterministic
regex parser (the LLM layer is off unless configured anyway).

### Frontend (port 5173)

```bash
cd src
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend on
`http://localhost:8000` (see [`vite.config.js`](src/vite.config.js)).

### Desktop app (Tauri)

Requires the Rust toolchain. The frontend build is wired into Tauri's
`beforeBuildCommand`, so a production build is:

```bash
cd src
npm install
npm run tauri:build      # = cross-env VITE_API_BASE_URL=… tauri build
```

This produces an NSIS installer (`src-tauri/target/release/bundle/nsis/*.exe`). For a
fully self-contained installer the Python backend is frozen with PyInstaller
(`pyinstaller bio_pro.spec`) and copied into `src-tauri/backend-server-dist/` before the
Tauri build — exactly the sequence in
[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml). The window
opens at 1600×960 ([`tauri.conf.json`](src-tauri/tauri.conf.json)).

### MCP server

[`src/mcp_server.py`](src/mcp_server.py) exposes the compiler pipeline as MCP tools over
stdio (for Claude Desktop / Claude Code):

```bash
python src/mcp_server.py
```

It is also auto-discovered by Claude Code via [`.mcp.json`](.mcp.json) at the repo root.
Tools: `list_parts`, `get_part`, `compile_circuit`, `simulate_circuit`,
`export_circuit`, `save_design`, `add_design_version`, `list_designs`, `get_design`,
`get_design_version`. Resources: `parts://library`, `designs://list`,
`designs://{id}`. It imports the backend modules directly — no HTTP proxy involved.

## API

Health and the core compile/simulate/parts/designs/export endpoints are defined in
[`main.py`](src/main.py); the rest are module routers (prefixes in the table above).

### Core

- `GET  /api/health` — status, LLM-parser flag, version
- `POST /api/lint` — fast parse+validate (no ODE); used by the Monaco editor on keystroke
- `GET  /api/parts` — parts library (optional `?host=` / `?type=` filters) + reporter/inducer id lists
- `GET  /api/parts/{part_id}` — one part by short id or BioBrick id
- `POST /api/compile` — body is **either** `{ "text": "Express GFP when IPTG is present" }`
  **or** `{ "form": { "output": "GFP", "inducer": "IPTG", "presence": "present" } }`
  (optional `organism`, `params`, `llm_config`). Returns
  `{ spec, circuit, validation, simulation, trace, citations, organism }`. Unparseable
  input → `400`; ambiguous LLM goal → `422` with a suggestions payload.
- `POST /api/circuit/to-dsl` — reverse-compile a ReactFlow graph back into `.biopro` lines

### Simulation

- `POST /api/simulate` — ODE for a given spec/params
- `POST /api/simulate/dose-response` — steady-state output vs. log-spaced inducer dose
- `POST /api/simulate/sensitivity` — tornado-chart parameter sensitivity
- `POST /api/simulate/sweep` — sweep one kinetic parameter, return all reporter curves
- `POST /api/simulate/stochastic` — Gillespie SSA: mean, p10/p90 bands, noise index
- `POST /api/simulations` · `GET /api/simulations` · `GET /api/simulations/{id}` — run history

### Designs, export, build-out

- `POST /api/designs`, `GET /api/designs`, `GET /api/designs/{id}` — saved designs (per `X-User-Email`)
- `POST /api/designs/{id}/versions`, `GET /api/designs/{id}/versions/{no}` — versioning
- `GET  /api/designs/{id}/versions/{a}/diff/{b}` — DSL + node diff between versions
- `POST /api/export` · `GET /api/designs/{id}/versions/{no}/export?format=` — `genbank` | `fasta` | `sbol` | `json`
- `POST /api/assembly` · `POST /api/assembly/pdf` — Gibson / Golden Gate protocol
- `POST /api/order` — IDT / Twist order-ready fragments

See the [Module reference](#module-reference) table for the chemistry, sequence,
primers, codon, crispr, seqmap, align, assays, pathway, protocol, experiments, git, and
projects routers. Interactive docs are at <http://localhost:8000/docs> when the backend
is running.

## ODE model

State variables are protein concentrations in **arbitrary units**. Default constants
(E. coli-scale, in [`ode.py`](src/modules/simulation/ode.py)) are `β_p = 10`,
`γ_p = 0.08`, `β_r = 4`, `γ_r = 0.1`, `K = 10`, `n = 2`, `Ki = 1`, `m = 1`,
`i_max = 5`. Each regulator `R` is held at its steady state `β_r/γ_r`; the inducer
`I(t)` is a step that switches at `t_on` (single input: `t_end/3`; multi-input:
`t_end·(idx+1)/4`), so the reporter curve moves after induction.

**Hill drives** ([`_drive`](src/modules/simulation/ode.py)):

- **Derepression:** `R_free = R / (1 + (I/Ki)^m)`, `f = 1/(1+(R_free/K)^n)`
- **Activation:** `A = R·(I/Ki)/(1+I/Ki)`, `f = (A/K)^n / (1+(A/K)^n)`

Multi-input patterns combine the per-input drives in
[`_combine`](src/modules/simulation/ode.py) (AND = product, OR = `1−∏(1−f)`,
NAND/NOR = their complements). The toggle switch, repressilator (oscillator),
positive/negative feedback, feed-forward loop, and band-pass filter each have a
dedicated multi-state ODE builder.

**Production term.** Each drive `f` is wrapped with a promoter-specific basal leak floor
before computing the rate:

```
f_eff    = basal_frac + (1 - basal_frac) · f
dP/dt    = β_p · max_expr · rbs_eff · f_eff  −  γ_p · P
```

| Parameter | Source | Example values |
|-----------|--------|----------------|
| `basal_frac` | `promoter.basal_expression / max_expression` | pBAD≈0.10, pLac=0.05, pTet=0.02 |
| `max_expr` | `promoter.max_expression` (a.u.) | pBAD=3.0, pTet=2.5, pLac=2.0 |
| `rbs_eff` | `SimParams.rbs_efficiency` override; **default 1.0** | — |

Circuits start at their basal steady state (`β_p·max_expr·rbs_eff·basal_frac / γ_p`), so
leaky promoters (e.g. pBAD, which trips the `leaky_expression` validator) show a visibly
elevated pre-induction plateau versus tight promoters (e.g. pTet). For patterns with an
*absent* inducer the reporter is pre-set to the induced steady state so the curve shows
the drop rather than a flat line.

> **RBS note:** the parts catalog carries `translation_efficiency` values
> (B0034=1.0, B0032=0.3, B0031=0.06, B0033=0.01, …), but the default ODE run uses
> `rbs_eff = 1.0` for every circuit. It is **not** auto-derived from the assembled RBS
> part — supply `SimParams.rbs_efficiency` to apply a specific RBS strength.

**Host scaling.** `beta_r/beta_p/gamma` are scaled per organism and the simulation end
time differs: E. coli `t_end = 200`, yeast `t_end = 600`, mammalian `t_end = 4000`
(minutes). Solved with `scipy.integrate.solve_ivp` (RK45).

## Stochastic simulation (Gillespie SSA)

[`stochastic.py`](src/modules/simulation/stochastic.py) implements the direct Gillespie
method on the same Hill-kinetics network. **Omega (Ω) scaling** converts dimensionless
ODE concentrations into integer molecule counts:

```
N_molecules = concentration_a.u. × Ω
```

| Reaction type | Propensity (reactions / time) | Rationale |
|---------------|-------------------------------|-----------|
| Zeroth-order production | `rate_a.u. × Ω` | Rate is per cell; more volume → more molecules |
| First-order degradation | `γ × N_molecules` | Rate is per molecule |

At steady state `<N_ss> = rate_a.u. × Ω / γ`, so dividing molecule counts by Ω on output
restores a.u. and the SSA mean overlays the ODE trace. Noise scales as
`CV = 1/√<N_ss>`, so larger Ω means smaller fluctuations.

**Default Ω** is `20` for E. coli and scales with cell volume:

| Host | Default Ω |
|------|-----------|
| E. coli (1 fL) | 20 |
| Yeast (42 fL) | 840 |
| Mammalian (2000 fL) | 40 000 |

An adaptive step budget (`t_end × 2 × β_p × Ω × 1.5`, hard-capped at 2 000 000) keeps
50-trajectory runs fast.

### `POST /api/simulate/stochastic`

```json
{
  "compile_result": { "...": "..." },
  "n_trajectories": 50,
  "seed": null,
  "omega": null,
  "threshold": null
}
```

- **`seed`** — `null` (default) gives fresh noise each run; an integer fixes the RNG for
  reproducible tests/CI.
- **`omega`** — `null` uses the host-volume-derived default; a positive float overrides it.
- **`n_trajectories`** — 1–500 (default 50).

## Tests & CI

Backend tests are pytest, run from `src/`:

```bash
cd src
pip install -r requirements.txt pytest
LLM_PARSER=off python -c "import main"   # import smoke test
LLM_PARSER=off pytest -q
```

Test suites live in [`src/tests/`](src/tests/): `test_compiler`, `test_validate`,
`test_export`, `test_chemistry`, `test_align`, `test_assays`, `test_codon`,
`test_crispr`, `test_seqmap`, `test_cloning_map`, `test_git`, `test_designs_api`,
`test_projects_api`, `test_app_imports`, `test_phase3`, `test_phase5`.

Frontend build check:

```bash
cd src
npm ci
npm run build
```

GitHub Actions:

- [`.github/workflows/test.yml`](.github/workflows/test.yml) — on every push/PR to any
  branch: Python 3.12 import smoke test + `pytest -q`, then Node 20 `npm ci` + `npm run
  build`.
- [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml) — on push
  to `main` (or manual dispatch): PyInstaller backend bundle + Tauri NSIS installer,
  uploaded as artifacts.

---

See [`prafea.md`](prafea.md) for a higher-level, non-technical overview of the project.
