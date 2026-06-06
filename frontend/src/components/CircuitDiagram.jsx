import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { nodeTypes } from "./partNodes.jsx";

// Edge styling encodes regulation kind.
const EDGE_STYLE = {
  expression: { stroke: "#2a9d8f", label: "→ expresses" },
  repression: { stroke: "#e76f51", label: "⊣ represses", dashed: false },
  activation: { stroke: "#43aa8b", label: "→ activates" },
  inhibition: { stroke: "#9d4edd", label: "⊣ inhibits", dashed: true },
};

const COL_W = 230;
const ROW_H = 150;

// Assign each node to a left-to-right column from its biological role, so the
// layout works for both single-input circuits and multi-input logic gates.
function columnOf(n) {
  if (n.reporter) return 4;            // output reporter
  if (n.type === "logic") return 3;    // AND/OR gate node
  if (n.type === "inducer") return 0;  // small-molecule input
  if (n.type === "promoter") return n.role === "constitutive" ? 0 : 2;
  if (n.type === "cds") return 1;      // regulator protein
  return 1;
}

// Manual layered layout: column by role, rows stacked within each column.
function layout(nodes) {
  const rows = {}; // column -> next row index
  return nodes.map((n) => {
    const col = columnOf(n);
    const row = rows[col] || 0;
    rows[col] = row + 1;
    return {
      id: n.id,
      type: n.type,
      position: { x: col * COL_W, y: row * ROW_H },
      data: {
        label: n.label,
        type: n.type,
        color: n.color,
        reporter: n.reporter,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

export default function CircuitDiagram({ circuit }) {
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!circuit) return { rfNodes: [], rfEdges: [] };
    const rfNodes = layout(circuit.nodes);
    const rfEdges = circuit.edges.map((e, i) => {
      const style = EDGE_STYLE[e.kind] || EDGE_STYLE.expression;
      const repressing = e.kind === "repression" || e.kind === "inhibition";
      return {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        label: style.label,
        animated: e.kind === "expression",
        style: {
          stroke: style.stroke,
          strokeWidth: 2,
          strokeDasharray: style.dashed ? "6 4" : undefined,
        },
        labelStyle: { fontSize: 11, fill: style.stroke },
        markerEnd: repressing
          ? undefined
          : { type: MarkerType.ArrowClosed, color: style.stroke },
      };
    });
    return { rfNodes, rfEdges };
  }, [circuit]);

  if (!circuit) {
    return <div className="panel-empty">Compile a goal to see the circuit.</div>;
  }

  return (
    <div className="circuit-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        zoomOnScroll={false}
      >
        <Background gap={18} color="#e8eef2" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
