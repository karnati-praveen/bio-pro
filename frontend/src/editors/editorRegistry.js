import CircuitEditor from "./CircuitEditor.jsx";
import SequenceEditor from "./SequenceEditor.jsx";
import SimulationEditor from "./SimulationEditor.jsx";
import PlaceholderEditor from "./PlaceholderEditor.jsx";
import WebviewEditor from "./WebviewEditor.jsx";

// Maps a tab's `type` to the editor component that renders it. Later phases
// replace the placeholders with SequenceEditor, MoleculeEditor, etc.
const REGISTRY = {
  circuit: CircuitEditor,
  sequence: SequenceEditor,
  webview: WebviewEditor,
  simulation: SimulationEditor,
  molecule: (props) => PlaceholderEditor({ ...props, label: "Molecular Structure Editor", phase: "Phase 4" }),
  reaction: (props) => PlaceholderEditor({ ...props, label: "Reaction Designer", phase: "Phase 4" }),
  spectrum: (props) => PlaceholderEditor({ ...props, label: "Spectroscopy Viewer", phase: "Phase 4" }),
  protocol: (props) => PlaceholderEditor({ ...props, label: "Protocol Generator", phase: "Phase 5" }),
  notebook: (props) => PlaceholderEditor({ ...props, label: "Experiment Notebook", phase: "Phase 5" }),
  pathway: (props) => PlaceholderEditor({ ...props, label: "Pathway Designer", phase: "Phase 5" }),
};

export function resolveEditor(type) {
  return REGISTRY[type] ?? ((props) => PlaceholderEditor({ ...props, label: "Unknown file type", phase: "" }));
}
