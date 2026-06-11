import { useState, useMemo } from "react";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useCircuitStore } from "../../shared/stores/circuitStore.js";
import { TEMPLATES, CATEGORIES, templateTabTitle } from "../../shared/lib/templates.js";

function openTemplate(tpl) {
  const tabs = useTabStore.getState();
  const circuits = useCircuitStore.getState();
  const id = tabs.openTab({
    type: tpl.type,
    title: templateTabTitle(tpl),
    content: tpl.content,
    meta: tpl.meta ?? {},
  });
  if (tpl.type === "circuit") {
    circuits.ensure(id, tpl.content);
    circuits.setDsl(id, tpl.content);
  }
}

// embedded: renders inline within WelcomeEditor (parent scrolls)
// !embedded: full-height flex container with internal scroll
export default function TemplateGallery({ embedded = false }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (cat !== "All" && t.category !== cat) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    });
  }, [search, cat]);

  const controls = (
    <div className="tpl-controls">
      <input
        className="tpl-search bio-input"
        type="search"
        placeholder="Search templates…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search templates"
      />
      <div className="tpl-cats" role="tablist" aria-label="Template categories">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            className={`tpl-cat-btn${cat === c ? " active" : ""}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );

  const grid = visible.length === 0 ? (
    <div className="tpl-empty bio-empty">
      <span>No templates match "{search}"</span>
    </div>
  ) : (
    <div className="tpl-grid">
      {visible.map((tpl) => (
        <button
          key={tpl.id}
          className="tpl-card"
          style={{ "--tpl-accent": tpl.accent }}
          onClick={() => openTemplate(tpl)}
          title={tpl.desc}
        >
          <span className="tpl-card-icon">{tpl.icon}</span>
          <div className="tpl-card-body">
            <div className="tpl-card-title">{tpl.title}</div>
            <div className="tpl-card-desc">{tpl.desc}</div>
            <span className="tpl-card-badge">{tpl.category}</span>
          </div>
        </button>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="tpl-gallery tpl-gallery--embedded">
        {controls}
        {grid}
      </div>
    );
  }

  return (
    <div className="tpl-gallery">
      {controls}
      <div className="tpl-scroll">
        {grid}
      </div>
    </div>
  );
}
