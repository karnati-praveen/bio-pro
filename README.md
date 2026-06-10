# 🧬 Biological Compiler

A prototype **IDE for synthetic biology**. Describe a biological function in plain
language (or via a structured form), and the tool:

1. **Parses** the intent into a formal biological specification
2. **Compiles** it into a genetic circuit (promoters, genes, regulators, terminators)
   using transparent rule-based logic — no LLM
3. **Simulates** the circuit's behavior over time with an ODE model (Hill kinetics)
4. **Visualizes** the result as a circuit node-graph + a protein-expression plot

> Example: *"Express GFP when IPTG is present"* → assembles `pCon → LacI ⊣ pLac → GFP`
> with `IPTG ⊣ LacI`, then simulates GFP rising after IPTG is added.

## Scope (MVP)

- **Inducible expression** circuits only: derepression (IPTG/pLac, aTc/pTet) and
  activation (arabinose/pBAD).
- A library of 15 real genetic parts in [`src/data/parts.json`](src/data/parts.json).
- No external biology APIs — everything runs locally.

## Architecture

Feature-based monorepo: each `src/modules/<feature>/` folder co-locates that
feature's FastAPI code (`api.py` + logic) **and** its React UI (`.jsx`), with
cross-cutting code under `src/shared/`.

```
src/                       Python · FastAPI · scipy  +  React · Vite · React Flow
  main.py                  FastAPI app entry (registers each module's router)
  data/parts.json          genetic parts library
  modules/
    compiler/              parser → rules → assembler + GoalInput, CircuitEditor, …
    simulation/            ode.py / stochastic.py + SimulationPlot, ParameterSweep, …
    parts/  sequence/  assembly/  ordering/  citations/  export/  llm/  settings/
  shared/
    db/                    SQLAlchemy engine + models + repo
    schemas/               Pydantic schemas
    lib/                   biopro-language, vscode-shim, api client (client.js)
    stores/                Zustand stores
    ui/                    cross-module React components
  shell/                   Tauri + React app shell (App.jsx, main.jsx, index.html)
src-tauri/                 Rust · Tauri native shell (unchanged)
```

The compiler runs in three transparent stages, each emitting a human-readable trace
shown in the UI's **Compiler trace** panel:

| Stage | File | Role |
|-------|------|------|
| Parser | [`parser.py`](src/modules/compiler/parser.py) | text / form → `IntentSpec` |
| Rules | [`rules.py`](src/modules/compiler/rules.py) | declarative inducer → promoter-system table |
| Assembler | [`assembler.py`](src/modules/compiler/assembler.py) | `IntentSpec` → circuit nodes + edges |

## Running

### Backend (port 8000)

```bash
cd src
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (port 5173)

```bash
cd src
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

## API

- `GET  /api/parts` — full parts library + reporter/inducer id lists
- `POST /api/compile` — body is **either** `{ "text": "Express GFP when IPTG is present" }`
  **or** `{ "form": { "output": "GFP", "inducer": "IPTG", "presence": "present" } }`.
  Returns `{ spec, circuit, simulation, trace }`. Unparseable input → `400` with a
  helpful message.

## ODE model

State variables are protein concentrations in **arbitrary units**. The regulator `R`
is pre-equilibrated at steady state; the inducer `I(t)` is a step that switches on at
`t = T/3`, so the reporter curve rises from its basal floor after induction.

**Hill drives** (raw, before basal correction):

- **Derepression:** `R_free = R / (1 + (I/Ki)^m)`, `f = 1/(1+(R_free/K)^n)`
- **Activation:** `A = R·(I/Ki)/(1+I/Ki)`, `f = (A/K)^n / (1+(A/K)^n)`

**Per-part kinetics** (from `src/data/parts.json` `kinetic_parameters`):

Each drive `f` is wrapped with a promoter-specific basal leak floor before computing the production rate:

```
f_eff    = basal_frac + (1 - basal_frac) · f
dP/dt    = β · max_expr · rbs_eff · f_eff  −  γ · P
```

| Parameter | Source | Example values |
|-----------|--------|----------------|
| `basal_frac` | `basal_expression / max_expression` | pBAD≈0.10, pLac≈0.05, pTet≈0.02 |
| `max_expr` | `promoter.max_expression` (a.u.) | pBAD=3.0, pTet=2.5, pLac=2.0 |
| `rbs_eff` | `rbs.translation_efficiency` | B0034=1.0, B0032=0.3, B0031=0.06 |

Circuits start at their basal steady state (`β·max_expr·rbs_eff·basal_frac / γ`),
so promoters with high basal (e.g. pBAD, flagged by the `leaky_expression` validator
warning) show a visibly elevated pre-induction plateau compared to tight promoters
(e.g. pTet). The `SimParams.rbs_efficiency` field overrides `rbs_eff` at runtime.

Solved with `scipy.integrate.solve_ivp` (RK45) over `t ∈ [0, 200]`.

## Stochastic simulation (Gillespie SSA)

`src/modules/simulation/stochastic.py` implements the direct Gillespie method on the
same Hill-kinetics reaction network.  A key design choice is **Omega (Ω) scaling**,
which converts the dimensionless ODE concentrations into integer molecule counts:

```
N_molecules = concentration_a.u. × Ω
```

### Propensity scaling

| Reaction type | Propensity (reactions / time) | Rationale |
|---------------|-------------------------------|-----------|
| Zeroth-order production | `rate_a.u. × Ω` | Rate is per cell; more volume → more molecules |
| First-order degradation | `γ × N_molecules` | Rate is per molecule |

At steady state `<N_ss> = rate_a.u. × Ω / γ`, so dividing molecule counts by Ω on
output restores a.u. units and the SSA mean overlays the ODE trace directly.

Noise scales as `CV = 1/√<N_ss>` (Poisson statistics), so increasing Ω reduces
stochastic fluctuations.

### Default Ω

| Host | Default Ω | Typical N at ODE SS (β=10, γ=0.08) |
|------|-----------|--------------------------------------|
| E. coli (1 fL) | 20 | ~2 500 molecules |
| Yeast (42 fL) | 840 | ~105 000 molecules |
| Mammalian (2 000 fL) | 40 000 | ~5 000 000 molecules |

The default Ω = 20 for E. coli keeps individual trajectory step counts within the
adaptive budget (`t_end × 2 × β_p × Ω × 1.5`, hard-capped at 2 000 000) so
50-trajectory runs finish in under a few seconds.  Increasing Ω improves accuracy
at the cost of more computation time.

### Request parameters (POST /api/stochastic)

```json
{
  "compile_result": { "...": "..." },
  "n_trajectories": 50,
  "seed": null,
  "omega": null,
  "threshold": null
}
```

- **`seed`** — `null` (default) gives different noise each run; an integer fixes the
  RNG for reproducible tests and CI.
- **`omega`** — `null` uses the host-volume-derived default; a positive float overrides it.
