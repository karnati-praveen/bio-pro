import { useTabStore } from "../shared/stores/tabStore.js";
import { useCircuitStore } from "../shared/stores/circuitStore.js";
import { useUiStore } from "../shared/stores/uiStore.js";
import Breadcrumb from "../shared/ui/Breadcrumb.jsx";

const HOST_MAP = {
  ecoli:      { label: "E. coli",      token: "var(--host-ecoli)" },
  yeast:      { label: "S. cerevisiae", token: "var(--host-yeast)" },
  mammalian:  { label: "Mammalian",    token: "var(--host-mammalian)" },
};

export default function TopBar() {
  const openPalette  = useUiStore((s) => s.openPalette);
  const toggleTheme  = useUiStore((s) => s.toggleTheme);
  const setActivity  = useUiStore((s) => s.setActivity);
  const theme        = useUiStore((s) => s.theme);

  const tab = useTabStore((s) => s.activeTab());
  const organism = useCircuitStore((s) => (tab ? (s.byTab[tab.id]?.organism ?? "") : ""));

  const host = HOST_MAP[organism];
  const hostColor = host ? host.token : "var(--host-none)";
  const hostLabel = host ? host.label : "Any host";
  const showHostChip = tab?.type === "circuit" || (tab && organism);

  return (
    <header className="topbar" role="banner">
      {/* Left — logo + wordmark */}
      <div className="topbar-left">
        <span className="topbar-logo" aria-hidden="true">◇</span>
        <span className="topbar-wordmark">BioIDE</span>
      </div>

      {/* Center — breadcrumb */}
      <div className="topbar-center">
        <Breadcrumb />
      </div>

      {/* Right — host chip + actions */}
      <div className="topbar-right">
        {showHostChip && (
          <span className="topbar-host-chip" title={`Host organism: ${hostLabel}`}>
            <span
              className="topbar-host-dot"
              style={{ background: hostColor }}
              aria-hidden="true"
            />
            <span className="topbar-host-label">{hostLabel}</span>
          </span>
        )}

        <button
          className="topbar-btn"
          onClick={openPalette}
          aria-label="Open command palette"
          title="Command palette (⌘K)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 5h8M4 8h5M4 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>

        <button
          className="topbar-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <button
          className="topbar-btn"
          onClick={() => setActivity("settings")}
          aria-label="Open settings"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.34 3.34l.85.85M11.81 11.81l.85.85M3.34 12.66l.85-.85M11.81 4.19l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
