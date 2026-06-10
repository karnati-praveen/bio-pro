import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useCircuitStore } from "../../shared/stores/circuitStore.js";
import { useProjectStore } from "../../shared/stores/projectStore.js";
import { listDesigns, loadVersion } from "../../shared/lib/api/client.js";

const EXAMPLES = [
  {
    id: "inducible-gfp",
    title: "Inducible GFP",
    desc: "Classic IPTG-inducible GFP reporter",
    icon: "🧬",
    accent: "var(--ft-circuit)",
    type: "circuit",
    content: "Express GFP when IPTG is present",
  },
  {
    id: "toggle-switch",
    title: "Toggle Switch",
    desc: "Bistable switch with IPTG and aTc",
    icon: "🔀",
    accent: "var(--ft-sequence)",
    type: "circuit",
    content: "Toggle switch with IPTG and aTc",
  },
  {
    id: "repressilator",
    title: "Repressilator",
    desc: "3-gene oscillator (Elowitz & Leibler)",
    icon: "🔄",
    accent: "var(--ft-simulation)",
    type: "circuit",
    content: "Repressilator oscillator with three repressors",
  },
  {
    id: "aspirin",
    title: "Aspirin Molecule",
    desc: "Acetylsalicylic acid — 2D/3D + Lipinski",
    icon: "💊",
    accent: "var(--ft-chemistry)",
    type: "molecule",
    content: "CC(=O)Oc1ccccc1C(=O)O",
    meta: { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin" },
  },
  {
    id: "glycolysis",
    title: "Glycolysis FBA",
    desc: "Upper glycolysis flux balance analysis",
    icon: "⚗️",
    accent: "var(--ft-pathway)",
    type: "pathway",
    content: "",
    meta: { template: "upper_glycolysis" },
  },
];

const QUICK_STARTS = [
  { id: "circuit",  label: "New Circuit",    icon: "🧬", cmd: "circuit" },
  { id: "molecule", label: "New Molecule",   icon: "💊", cmd: "molecule" },
  { id: "pathway",  label: "New Pathway",    icon: "⚗️", cmd: "pathway" },
  { id: "notebook", label: "New Notebook",   icon: "📓", cmd: "notebook" },
];

function openTab(tabs, circuits, item) {
  const id = tabs.openTab({
    type: item.type,
    title: item.id + (item.type === "circuit" ? ".biopro" : item.type === "molecule" ? ".smiles" : "." + item.type),
    content: item.content,
    meta: item.meta || {},
  });
  if (item.type === "circuit") {
    circuits.ensure(id, item.content);
    circuits.setDsl(id, item.content);
  }
}

const CLEARED_KEY = "bio-cleared-design-ids";

function getClearedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(CLEARED_KEY) || "[]")); }
  catch { return new Set(); }
}

function RecentDesigns() {
  const tabs = useTabStore.getState();
  const circuits = useCircuitStore.getState();
  const [clearedIds, setClearedIds] = useState(getClearedIds);
  const [loading, setLoading] = useState(null); // design id being opened

  const { data: allDesigns = [] } = useQuery({
    queryKey: ["designs"],
    queryFn: listDesigns,
    staleTime: 30_000,
  });

  const visible = allDesigns.filter((d) => !clearedIds.has(d.id)).slice(0, 5);

  if (visible.length === 0) return null;

  function clearRecents() {
    const ids = new Set(visible.map((d) => d.id));
    const next = new Set([...clearedIds, ...ids]);
    setClearedIds(next);
    localStorage.setItem(CLEARED_KEY, JSON.stringify([...next]));
  }

  async function openDesign(design) {
    if (loading !== null) return;
    setLoading(design.id);
    try {
      const v = await loadVersion(design.id, design.latest_version);
      const title = design.name.endsWith(".biopro") ? design.name : design.name + ".biopro";
      const dsl = v.request?.goal || "";
      const id = tabs.openTab({ type: "circuit", title, content: dsl });
      circuits.ensure(id, dsl);
      circuits.loadResult(id, v.response, v.request);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="welcome-section">
      <h2 className="welcome-section-title">
        Recent designs
        <button className="welcome-clear-recents link-btn" onClick={clearRecents}>
          Clear recents
        </button>
      </h2>
      <div className="welcome-recent-designs">
        {visible.map((d) => (
          <button
            key={d.id}
            className="welcome-design-card"
            onClick={() => openDesign(d)}
            disabled={loading === d.id}
          >
            <div className="welcome-design-name">{d.name}</div>
            <div className="welcome-design-meta">
              <span>{new Date(d.updated_at).toLocaleDateString()}</span>
              <span>{d.reporter_count ?? 0} reporter{(d.reporter_count ?? 0) !== 1 ? "s" : ""}</span>
              <span>{d.inducer_count ?? 0} inducer{(d.inducer_count ?? 0) !== 1 ? "s" : ""}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function WelcomeEditor() {
  const tabs    = useTabStore.getState();
  const circuits = useCircuitStore.getState();
  const openProject = useProjectStore((s) => s.openProject);
  const recentTabs = useTabStore((s) =>
    Object.values(s.tabsById)
      .filter((t) => t.filePath && t.type !== "welcome")
      .slice(0, 8)
  );

  const [hideOnStartup, setHideOnStartup] = useState(
    () => localStorage.getItem("bio-welcome-hide") === "1"
  );

  function toggleHide(v) {
    setHideOnStartup(v);
    localStorage.setItem("bio-welcome-hide", v ? "1" : "0");
  }

  function openNew(type) {
    const titleMap = { circuit: "untitled.biopro", molecule: "molecule.smiles", pathway: "pathway.pathway", notebook: "experiments.notebook" };
    const id = tabs.openTab({ type, title: titleMap[type] || "untitled", content: "" });
    if (type === "circuit") { circuits.ensure(id, ""); circuits.setDsl(id, ""); }
  }

  return (
    <div className="welcome-editor">
      {/* Hero */}
      <div className="welcome-hero">
        <div className="welcome-logo">🧪</div>
        <div className="welcome-title">BioIDE</div>
        <div className="welcome-subtitle">Synthetic biology &amp; chemistry — from circuit to clone</div>
      </div>

      <div className="welcome-body">
        {/* Quick start */}
        <section className="welcome-section">
          <h2 className="welcome-section-title">Start</h2>
          <div className="welcome-quickstart">
            {QUICK_STARTS.map((q) => (
              <button key={q.id} className="welcome-qs-btn" onClick={() => openNew(q.cmd)}>
                <span className="welcome-qs-icon">{q.icon}</span>
                <span>{q.label}</span>
              </button>
            ))}
            <button className="welcome-qs-btn" onClick={openProject}>
              <span className="welcome-qs-icon">📂</span>
              <span>Open Folder</span>
            </button>
          </div>
        </section>

        {/* Examples */}
        <section className="welcome-section">
          <h2 className="welcome-section-title">Examples</h2>
          <div className="welcome-examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                className="welcome-example-card"
                style={{ "--ex-accent": ex.accent }}
                onClick={() => openTab(tabs, circuits, ex)}
              >
                <span className="welcome-ex-icon">{ex.icon}</span>
                <div className="welcome-ex-info">
                  <div className="welcome-ex-title">{ex.title}</div>
                  <div className="welcome-ex-desc">{ex.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Recent designs */}
        <RecentDesigns />

        {/* Recent */}
        {recentTabs.length > 0 && (
          <section className="welcome-section">
            <h2 className="welcome-section-title">Recent</h2>
            <ul className="welcome-recent">
              {recentTabs.map((t) => (
                <li key={t.id}>
                  <button className="welcome-recent-item" onClick={() => useTabStore.getState().setActiveTab(t.id)}>
                    <span className="welcome-recent-icon">{t.icon}</span>
                    <span className="welcome-recent-name">{t.title}</span>
                    {t.filePath && <span className="welcome-recent-path">{t.filePath}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <div className="welcome-footer">
          <label className="welcome-hide-toggle">
            <input
              type="checkbox"
              checked={hideOnStartup}
              onChange={(e) => toggleHide(e.target.checked)}
            />
            <span>Don't show on startup</span>
          </label>
        </div>
      </div>
    </div>
  );
}
