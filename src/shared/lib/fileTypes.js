// Maps file extensions to an editor type, a Monaco language, and a display icon.
// The editorRegistry resolves the editor component from the `editor` type here.

const TYPES = {
  biopro:   { editor: "circuit",  language: "biopro", icon: "🧬" },
  sbol:     { editor: "circuit",  language: "xml",    icon: "🧬" },
  gb:       { editor: "sequence", language: "text",   icon: "🧬" },
  gbk:      { editor: "sequence", language: "text",   icon: "🧬" },
  fasta:    { editor: "sequence", language: "text",   icon: "🧬" },
  fa:       { editor: "sequence", language: "text",   icon: "🧬" },
  mol:      { editor: "molecule", language: "text",   icon: "⚗️" },
  sdf:      { editor: "molecule", language: "text",   icon: "⚗️" },
  smiles:   { editor: "molecule", language: "text",   icon: "⚗️" },
  smi:      { editor: "molecule", language: "text",   icon: "⚗️" },
  rxn:      { editor: "reaction", language: "text",   icon: "⚗️" },
  jdx:      { editor: "spectrum", language: "text",   icon: "📈" },
  dx:       { editor: "spectrum", language: "text",   icon: "📈" },
  protocol: { editor: "protocol", language: "json",   icon: "📋" },
  sim:      { editor: "simulation", language: "json", icon: "📊" },
  pathway:  { editor: "pathway",  language: "json",   icon: "🕸️" },
  notebook: { editor: "notebook", language: "markdown", icon: "📓" },
};


const FALLBACK = { editor: "circuit", language: "biopro", icon: "📄" };

function extOf(filePath) {
  if (!filePath) return "";
  const name = filePath.split(/[\\/]/).pop();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function typeInfoForFile(filePath) {
  return TYPES[extOf(filePath)] ?? FALLBACK;
}

export function editorTypeForFile(filePath) {
  return typeInfoForFile(filePath).editor;
}

export function languageForFile(filePath) {
  return typeInfoForFile(filePath).language;
}

export function iconForFile(filePath, editorType) {
  if (filePath) return typeInfoForFile(filePath).icon;
  const byEditor = {
    circuit: "🧬", sequence: "🧬", molecule: "⚗️",
    protocol: "📋", simulation: "📊", pathway: "🕸️", notebook: "📓",
    plasmid: "🔬",
  };
  return byEditor[editorType] ?? "📄";
}
