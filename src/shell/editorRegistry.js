import CircuitEditor from "../modules/compiler/CircuitEditor.jsx";
import SequenceEditor from "../modules/sequence/SequenceEditor.jsx";
import SimulationEditor from "../modules/simulation/SimulationEditor.jsx";
import MoleculeEditor from "../modules/chemistry/MoleculeEditor.jsx";
import ReactionEditor from "../modules/chemistry/ReactionEditor.jsx";
import SpectrumEditor from "../modules/chemistry/SpectrumEditor.jsx";
import ProtocolEditor from "../modules/protocol/ProtocolEditor.jsx";
import NotebookEditor from "../modules/experiments/NotebookEditor.jsx";
import PathwayEditor from "../modules/pathway/PathwayEditor.jsx";
import PrimersEditor from "../modules/primers/PrimersEditor.jsx";
import WelcomeEditor from "../modules/welcome/WelcomeEditor.jsx";
import PlaceholderEditor from "../shared/ui/PlaceholderEditor.jsx";
import WebviewEditor from "../shared/ui/WebviewEditor.jsx";

const REGISTRY = {
  welcome: WelcomeEditor,
  circuit: CircuitEditor,
  sequence: SequenceEditor,
  webview: WebviewEditor,
  simulation: SimulationEditor,
  molecule: MoleculeEditor,
  reaction: ReactionEditor,
  spectrum: SpectrumEditor,
  protocol: ProtocolEditor,
  notebook: NotebookEditor,
  pathway: PathwayEditor,
  primers: PrimersEditor,
};

export function resolveEditor(type) {
  return REGISTRY[type] ?? ((props) => PlaceholderEditor({ ...props, label: "Unknown file type", phase: "" }));
}
