import CircuitEditor from "../modules/compiler/CircuitEditor.jsx";
import SequenceEditor from "../modules/sequence/SequenceEditor.jsx";
import SimulationEditor from "../modules/simulation/SimulationEditor.jsx";
import MoleculeEditor from "../modules/chemistry/MoleculeEditor.jsx";
import ReactionEditor from "../modules/chemistry/ReactionEditor.jsx";
import SpectrumEditor from "../modules/chemistry/SpectrumEditor.jsx";
import TitrationView from "../modules/chemistry/TitrationView.jsx";
import ProtocolEditor from "../modules/protocol/ProtocolEditor.jsx";
import NotebookEditor from "../modules/experiments/NotebookEditor.jsx";
import PathwayEditor from "../modules/pathway/PathwayEditor.jsx";
import PrimersEditor from "../modules/primers/PrimersEditor.jsx";
import GuideDesigner from "../modules/crispr/GuideDesigner.jsx";
import WelcomeEditor from "../modules/welcome/WelcomeEditor.jsx";
import PlasmidMap from "../modules/seqmap/PlasmidMap.jsx";
import CodonOptimizer from "../modules/codon/CodonOptimizer.jsx";
import AlignmentView from "../modules/align/AlignmentView.jsx";
import AssaySimulator from "../modules/assays/AssaySimulator.jsx";
import TemplatesEditor from "../modules/templates/TemplatesEditor.jsx";
import PlaceholderEditor from "../shared/ui/PlaceholderEditor.jsx";
import WebviewEditor from "../shared/ui/WebviewEditor.jsx";

const REGISTRY = {
  welcome:   WelcomeEditor,
  templates: TemplatesEditor,
  circuit:  CircuitEditor,
  plasmid:  PlasmidMap,
  sequence: SequenceEditor,
  webview: WebviewEditor,
  simulation: SimulationEditor,
  molecule: MoleculeEditor,
  reaction: ReactionEditor,
  spectrum: SpectrumEditor,
  titration: TitrationView,
  protocol: ProtocolEditor,
  notebook: NotebookEditor,
  pathway: PathwayEditor,
  primers: PrimersEditor,
  crispr:  GuideDesigner,
  codon:   CodonOptimizer,
  alignment: AlignmentView,
  assay:     AssaySimulator,
};

export function resolveEditor(type) {
  return REGISTRY[type] ?? ((props) => PlaceholderEditor({ ...props, label: "Unknown file type", phase: "" }));
}
