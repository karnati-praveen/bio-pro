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
- A library of 15 real genetic parts in [`backend/data/parts.json`](backend/data/parts.json).
- No database, no external biology APIs — everything runs locally.

## Architecture

```
backend/                 Python · FastAPI · scipy
  data/parts.json        genetic parts library
  models/                parts loader + Pydantic schemas
  compiler/              parser → rules → assembler  (intent → circuit)
  simulation/ode.py      Hill-kinetics ODE model (scipy solve_ivp)
  main.py                FastAPI endpoints
frontend/                React · Vite · React Flow · Recharts
  src/components/         GoalInput, CircuitDiagram, SimulationPlot, SpecPanel, PartsLegend
```

The compiler runs in three transparent stages, each emitting a human-readable trace
shown in the UI's **Compiler trace** panel:

| Stage | File | Role |
|-------|------|------|
| Parser | [`compiler/parser.py`](backend/compiler/parser.py) | text / form → `IntentSpec` |
| Rules | [`compiler/rules.py`](backend/compiler/rules.py) | declarative inducer → promoter-system table |
| Assembler | [`compiler/assembler.py`](backend/compiler/assembler.py) | `IntentSpec` → circuit nodes + edges |

## Running

### Backend (port 8000)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (port 5173)

```bash
cd frontend
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
`t = T/3`, so the reporter curve is flat (basal) then rises after induction.

- **Derepression:** `R_free = R / (1 + (I/Ki)^m)`, `f = 1/(1+(R_free/K)^n)`
- **Activation:** `A = R·(I/Ki)/(1+I/Ki)`, `f = (A/K)^n / (1+(A/K)^n)`
- **Reporter:** `dP/dt = β·strength·f − γ·P`

Solved with `scipy.integrate.solve_ivp` (RK45) over `t ∈ [0, 200]`.
