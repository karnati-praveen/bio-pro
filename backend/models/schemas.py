"""Pydantic request/response models for the Biological Compiler API."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator


# --------------------------------------------------------------------------- #
# LLM configuration (passed from frontend; key never stored server-side)
# --------------------------------------------------------------------------- #
class LLMConfig(BaseModel):
    provider: Literal["anthropic", "openai", "google", "mistral", "ollama"]
    model: str
    api_key: Optional[str] = None     # None for ollama; masked in all logs
    temperature: float = Field(0.2, ge=0.0, le=1.0)
    ollama_url: Optional[str] = None  # ollama base URL, default http://localhost:11434


# --------------------------------------------------------------------------- #
# Enumerations
# --------------------------------------------------------------------------- #
Pattern = Literal[
    "inducible_expression",
    "logic_and",
    "logic_or",
    "repressible_expression",
    "constitutive_expression",
    "not_gate",
    "toggle_switch",
    "negative_feedback",
    "positive_feedback",
    "feed_forward_loop",
    "band_pass_filter",
    "oscillator",
    "logic_nand",
    "logic_nor",
    "combinatorial_logic",
]

Gate = Literal["and", "or"]

HostOrganism = Literal["ecoli", "yeast", "mammalian"]


# --------------------------------------------------------------------------- #
# Requests
# --------------------------------------------------------------------------- #
class SimParams(BaseModel):
    """Optional overrides for ODE kinetic constants (all in a.u.)."""

    beta_p: Optional[float] = Field(None, gt=0, description="max reporter production rate")
    gamma_p: Optional[float] = Field(None, gt=0, description="reporter degradation rate")
    k: Optional[float] = Field(None, gt=0, description="Hill half-max constant")
    n: Optional[float] = Field(None, gt=0, description="Hill coefficient (cooperativity)")
    i_max: Optional[float] = Field(None, gt=0, description="inducer level once switched on")
    duration: Optional[float] = Field(None, gt=0, description="simulation end time override (min)")


class FormInput(BaseModel):
    """Structured-form input: unambiguous dropdown selections."""

    output: str = Field(..., description="Reporter id, e.g. 'GFP'")
    inducer: str = Field(..., description="Inducer id, e.g. 'IPTG'")
    presence: Literal["present", "absent"] = "present"
    inducer2: Optional[str] = Field(None, description="Second inducer id for logic gate")
    gate: Optional[Gate] = Field(None, description="'and' or 'or' for two-input gate")


class CompileRequest(BaseModel):
    """Compile request: EITHER free text OR structured form, plus optional organism and params."""

    text: Optional[str] = None
    form: Optional[FormInput] = None
    params: Optional[SimParams] = None
    organism: Optional[HostOrganism] = Field(None, description="Target host organism")
    llm_config: Optional[LLMConfig] = None  # when set, LLM compiler is used instead of rule-based

    @model_validator(mode="after")
    def _one_of(self) -> "CompileRequest":
        if not self.text and not self.form:
            raise ValueError("Provide either 'text' or 'form'.")
        return self


# --------------------------------------------------------------------------- #
# Intermediate / response shapes
# --------------------------------------------------------------------------- #
class Trigger(BaseModel):
    inducer: str
    presence: Literal["present", "absent"]


class IntentSpec(BaseModel):
    output: str
    triggers: list[Trigger]
    pattern: Pattern
    organism: Optional[HostOrganism] = None
    trace: list[str] = []

    @property
    def trigger(self) -> Trigger:
        return self.triggers[0]


class CircuitNode(BaseModel):
    id: str
    type: str
    label: str
    role: Optional[str] = None
    reporter: bool = False
    color: Optional[str] = None


class CircuitEdge(BaseModel):
    source: str
    target: str
    kind: Literal["expression", "repression", "activation", "inhibition"]


class TranscriptionUnit(BaseModel):
    name: str
    parts: list[str]


class Circuit(BaseModel):
    nodes: list[CircuitNode]
    edges: list[CircuitEdge]
    transcription_units: list[TranscriptionUnit]
    trace: list[str] = []


class Series(BaseModel):
    name: str
    values: list[float]
    color: Optional[str] = None
    is_reporter: bool = False


class Simulation(BaseModel):
    t: list[float]
    series: list[Series]


# --------------------------------------------------------------------------- #
# Stochastic simulation
# --------------------------------------------------------------------------- #
class StochasticRequest(BaseModel):
    """Request to run Gillespie stochastic simulation."""
    compile_result: "CompileResponse"
    n_trajectories: int = Field(50, ge=1, le=500)
    threshold: Optional[float] = Field(None, description="Threshold for probability calculation")


class StochasticSeries(BaseModel):
    name: str
    mean: list[float]
    p10: list[float]       # 10th percentile
    p90: list[float]       # 90th percentile
    trajectories: Optional[list[list[float]]] = None  # all raw traces
    cv_steady_state: Optional[float] = None            # coefficient of variation at steady state
    prob_above_threshold: Optional[float] = None       # P(output > threshold) at t_end
    color: Optional[str] = None
    is_reporter: bool = False


class StochasticSimulation(BaseModel):
    t: list[float]
    series: list[StochasticSeries]
    n_trajectories: int
    noise_index: float      # CV of reporter at steady state


# --------------------------------------------------------------------------- #
# Parameter sweep
# --------------------------------------------------------------------------- #
class SweepRequest(BaseModel):
    """Run the ODE across a range of one kinetic parameter."""
    compile_result: "CompileResponse"
    parameter: str = Field(..., description="Parameter name: beta_p, gamma_p, k, n, or i_max")
    min_val: float = Field(..., gt=0)
    max_val: float = Field(..., gt=0)
    steps: int = Field(10, ge=2, le=50)


class SweepCurve(BaseModel):
    param_value: float
    values: list[float]   # reporter values at each t


class SweepResponse(BaseModel):
    t: list[float]
    parameter: str
    curves: list[SweepCurve]
    sensitivity_score: float   # % change peak output / % change param across full range
    top_sensitive: list[dict]  # top 3 params by sensitivity (from full analysis)


# --------------------------------------------------------------------------- #
# Assembly / cloning
# --------------------------------------------------------------------------- #
class AssemblyRequest(BaseModel):
    compile_result: "CompileResponse"
    method: Literal["gibson", "golden_gate"] = "gibson"


class AssemblyFragment(BaseModel):
    name: str
    sequence: str
    length: int
    order_sequence: Optional[str] = None   # sequence to order (with overlaps/overhangs)


class AssemblyProtocol(BaseModel):
    method: str
    fragments: list[AssemblyFragment]
    steps: list[str]
    notes: list[str] = []


# --------------------------------------------------------------------------- #
# Citations
# --------------------------------------------------------------------------- #
class Citation(BaseModel):
    doi: str
    title: Optional[str] = None
    authors: Optional[str] = None   # "Author1, Author2 et al."
    journal: Optional[str] = None
    year: Optional[int] = None
    url: Optional[str] = None
    context: str = ""              # why this was referenced


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
class ValidationFinding(BaseModel):
    code: str
    severity: Literal["error", "warning", "info"]
    message: str
    target: Optional[str] = None
    fix_suggestion: Optional[str] = None


class ValidationResult(BaseModel):
    ok: bool
    findings: list[ValidationFinding] = []


# --------------------------------------------------------------------------- #
# Compile response
# --------------------------------------------------------------------------- #
class CompileResponse(BaseModel):
    spec: IntentSpec
    circuit: Circuit
    validation: ValidationResult
    simulation: Simulation
    trace: list[str]
    citations: list[Citation] = []
    organism: Optional[HostOrganism] = None
    # LLM metadata — present only when an LLM was used
    compiler_used: str = "rule_based"          # "llm" | "rule_based" | "llm_fallback"
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_tokens: Optional[dict] = None          # {"input": int, "output": int}
    llm_latency_ms: Optional[int] = None
    llm_raw_response: Optional[str] = None


# Fix forward references
StochasticRequest.model_rebuild()
SweepRequest.model_rebuild()
AssemblyRequest.model_rebuild()
