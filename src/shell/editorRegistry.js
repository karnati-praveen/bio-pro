import CircuitEditor from "../modules/compiler/CircuitEditor.jsx";
import SequenceEditor from "../modules/sequence/SequenceEditor.jsx";
import SimulationEditor from "../modules/simulation/SimulationEditor.jsx";
import MoleculeEditor from "../modules/chemistry/MoleculeEditor.jsx";
import ReactionEditor from "../modules/chemistry/ReactionEditor.jsx";
import SpectrumEditor from "../modules/chemistry/SpectrumEditor.jsx";
import PlaceholderEditor from "../shared/ui/PlaceholderEditor.jsx";
import WebviewEditor from "../shared/ui/WebviewEditor.jsx";

// Maps a tab's `type` to the editor component that renders it. Later phases
// replace the placeholders with SequenceEditor, MoleculeEditor, etc.
const REGISTRY = {
  circuit: CircuitEditor,
  sequence: SequenceEditor,
  webview: WebviewEditor,
  simulation: SimulationEditor,
  molecule: MoleculeEditor,
  reaction: ReactionEditor,
  spectrum: SpectrumEditor,
  protocol: (props) => PlaceholderEditor({ ...props, label: "Protocol Generator", phase: "Phase 5" }),
  notebook: (props) => PlaceholderEditor({ ...props, label: "Experiment Notebook", phase: "Phase 5" }),
  pathway: (props) => PlaceholderEditor({ ...props, label: "Pathway Designer", phase: "Phase 5" }),
};

export function resolveEditor(type) {
  return REGISTRY[type] ?? ((props) => PlaceholderEditor({ ...props, label: "Unknown file type", phase: "" }));
}
