import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from "reactflow";
import { toPng } from "html-to-image";
import "reactflow/dist/style.css";
import { nodeTypes } from "./partNodes.jsx";
import { usePartsStore } from "../../shared/stores/partsStore.js";
import { useUiStore } from "../../shared/stores/uiStore.js";
import { useTabStore } from "../../shared/stores/tabStore.js";
import { useCircuitStore } from "../../shared/stores/circuitStore.js";

// Edge styling encodes regulation kind.
const EDGE_STYLE = {
  expression: { stroke: "var(--accent)", label: "→ expresses" },
  repression: { stroke: "var(--error)", label: "⊣ represses", dashed: false },
  activation: { stroke: "var(--accent)", label: "→ activates" },
  inhibition: { stroke: "var(--feat-operator)", label: "⊣ inhibits", dashed: true },
};

const NODE_MINIMAP_COLOR = {
  promoter: "var(--feat-promoter)", cds: "var(--feat-cds)", inducer: "var(--modified)", rbs: "var(--feat-rbs)",
  terminator: "var(--feat-terminator)", operator: "var(--feat-operator)", reporter: "var(--accent)", logic: "var(--text-muted)",
};

const COL_W = 230;
const ROW_H = 150;

// Assign each node to a left-to-right column from its biological role.
function columnOf(n) {
  if (n.reporter || n.type === "reporter") return 4;
  if (n.type === "logic") return 3;
  if (n.type === "inducer") return 0;
  if (n.type === "promoter") return n.role === "constitutive" ? 0 : 2;
  if (n.type === "cds") return 1;
  return 1;
}

// Manual layered layout: column by role, rows stacked within each column.
function layout(nodes) {
  const rows = {};
  return nodes.map((n) => {
    const col = columnOf(n);
    const row = rows[col] || 0;
    rows[col] = row + 1;
    return {
      id: n.id,
      type: n.type,
      position: { x: col * COL_W, y: row * ROW_H },
      data: { label: n.label, type: n.type, color: n.color, reporter: n.reporter },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

function FlowCanvas({ circuit, findings, focusNodeId, focusTs }) {
  const rf = useReactFlow();
  const [snap, setSnap] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, nodeId }

  const selectPart = usePartsStore((s) => s.select);
  const setFilter = usePartsStore((s) => s.setFilter);
  const parts = usePartsStore((s) => s.parts);
  const setActivity = useUiStore((s) => s.setActivity);
  const toggleSecondary = useUiStore((s) => s.toggleSecondary);
  const secondaryVisible = useUiStore((s) => s.secondaryVisible);
  const setStatus = useUiStore((s) => s.setStatus);
  const openTab = useTabStore((s) => s.openTab);
  const fetchParts = usePartsStore((s) => s.fetch);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  const posRef = useRef({});
  const [nodes, setNodes] = useState([]);

  // Build nodeId → findings[] map so each node knows its problems.
  const nodeFindings = useMemo(() => {
    const map = {};
    for (const f of (findings || [])) {
      if (!f.target) continue;
      if (!map[f.target]) map[f.target] = [];
      map[f.target].push(f);
    }
    return map;
  }, [findings]);

  // Rebuild nodes whenever circuit topology or findings change.
  useEffect(() => {
    const laid = layout(circuit.nodes);
    setNodes(laid.map((n) => {
      const base = posRef.current[n.id] ? { ...n, position: posRef.current[n.id] } : n;
      return { ...base, data: { ...base.data, findings: nodeFindings[n.id] || [] } };
    }));
  }, [circuit, nodeFindings]);

  // Pan to the focused node and apply a glow effect for 2 s.
  useEffect(() => {
    if (!focusNodeId || !focusTs) return;
    setNodes((prev) => prev.map((n) => ({
      ...n,
      className: n.id === focusNodeId ? "node-glowing" : undefined,
    })));
    const current = rf.getNodes().find((n) => n.id === focusNodeId);
    if (current) {
      rf.setCenter(
        current.position.x + 65,
        current.position.y + 40,
        { duration: 500, zoom: 1.5 },
      );
    }
    const timer = setTimeout(() => {
      setNodes((prev) => prev.map((n) => ({ ...n, className: undefined })));
    }, 2000);
    return () => clearTimeout(timer);
  }, [focusTs]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          posRef.current[change.id] = change.position;
        }
      }
      return updated;
    });
  }, []);

  const resetLayout = useCallback(() => {
    posRef.current = {};
    const laid = layout(circuit.nodes);
    setNodes(laid.map((n) => ({
      ...n,
      data: { ...n.data, findings: nodeFindings[n.id] || [] },
    })));
  }, [circuit, nodeFindings]);

  const rfEdges = useMemo(() => circuit.edges.map((e, i) => {
    const style = EDGE_STYLE[e.kind] || EDGE_STYLE.expression;
    const repressing = e.kind === "repression" || e.kind === "inhibition";
    return {
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: style.label,
      animated: e.kind === "expression",
      style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.dashed ? "6 4" : undefined },
      labelStyle: { fontSize: 11, fill: style.stroke },
      markerEnd: repressing ? undefined : { type: MarkerType.ArrowClosed, color: style.stroke },
    };
  }), [circuit]);

  const onNodeContextMenu = useCallback((e, node) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const exportPng = useCallback(() => {
    const vp = document.querySelector(".react-flow__viewport");
    if (!vp) return;
    toPng(vp, { backgroundColor: "var(--on-accent)", pixelRatio: 2 }).then((url) => {
      const a = document.createElement("a");
      a.download = "circuit.png";
      a.href = url;
      a.click();
    });
  }, []);

  const generateDsl = useCallback(async () => {
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    try {
      const res = await fetch(`${base}/api/circuit/to-dsl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: circuit.nodes, edges: circuit.edges }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { dsl } = await res.json();
      const tabId = useTabStore.getState().activeTab()?.id;
      if (tabId) useCircuitStore.getState().setDsl(tabId, dsl);
      useUiStore.getState().addToast("DSL updated from diagram");
    } catch (err) {
      useUiStore.getState().addToast(`Failed to generate DSL: ${err.message}`, "error");
    }
  }, [circuit]);

  // Context-menu actions
  const viewDetails = () => {
    selectPart(menu.nodeId);
    if (!secondaryVisible) toggleSecondary();
    closeMenu();
  };
  const showSequence = () => {
    const part = parts?.parts?.find((p) => p.id === menu.nodeId);
    const seq = part?.seq || part?.sequence || "";
    if (!seq) { setStatus(`No sequence on record for ${menu.nodeId}.`); closeMenu(); return; }
    openTab({ type: "sequence", title: `${menu.nodeId}.fasta`, content: `>${menu.nodeId}\n${seq}`, meta: { sequence: seq, name: menu.nodeId } });
    closeMenu();
  };
  const findSimilar = () => {
    const part = parts?.parts?.find((p) => p.id === menu.nodeId);
    if (part) setFilter("type", part.type);
    setActivity("parts");
    closeMenu();
  };

  return (
    <>
      <div className="canvas-toolbar">
        <button className="icon-btn" title="Fit view" onClick={() => rf.fitView({ duration: 300 })}>⤢</button>
        <button className="icon-btn" title="Zoom in" onClick={() => rf.zoomIn()}>＋</button>
        <button className="icon-btn" title="Zoom out" onClick={() => rf.zoomOut()}>－</button>
        <button className="icon-btn" title="Auto-layout (fit)" onClick={() => rf.fitView({ duration: 300 })}>▦</button>
        <button className="icon-btn" title="Reset layout" onClick={resetLayout}>↺</button>
        <button className={`icon-btn${snap ? " active" : ""}`} title="Toggle grid snap" onClick={() => setSnap((s) => !s)}>⊞</button>
        <button className="icon-btn" title="Export PNG" onClick={exportPng}>⤓PNG</button>
        <button className="icon-btn" title="Generate DSL from diagram" onClick={generateDsl}>⟳DSL</button>
      </div>
      <div className="circuit-canvas" onClick={closeMenu}>
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          zoomOnScroll={false}
          snapToGrid={snap}
          snapGrid={[16, 16]}
          multiSelectionKeyCode="Shift"
          selectionOnDrag
          panOnDrag={[1, 2]}
          onNodeContextMenu={onNodeContextMenu}
        >
          <Background gap={18} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => NODE_MINIMAP_COLOR[n.data?.type] || "var(--text-muted)"}
          />
        </ReactFlow>
        {menu && (
          <ul className="node-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <li onClick={viewDetails}>View Part Details</li>
            <li onClick={showSequence}>Show Sequence</li>
            <li onClick={findSimilar}>Find Similar Parts</li>
            <li className="disabled" title="Coming soon">Replace Part…</li>
          </ul>
        )}
      </div>
    </>
  );
}

export default function CircuitDiagram({ circuit, findings, focusNodeId, focusTs }) {
  if (!circuit) {
    return <div className="panel-empty">Compile a goal to see the circuit.</div>;
  }
  return (
    <ReactFlowProvider>
      <FlowCanvas
        circuit={circuit}
        findings={findings}
        focusNodeId={focusNodeId}
        focusTs={focusTs}
      />
    </ReactFlowProvider>
  );
}
