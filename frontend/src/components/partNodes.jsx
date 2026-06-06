import { Handle, Position } from "reactflow";

// SBOL-ish shapes per part type. Each node exposes left (target) and right
// (source) handles so React Flow can route edges horizontally.

const TYPE_LABEL = {
  promoter: "Promoter",
  cds: "CDS",
  inducer: "Inducer",
  rbs: "RBS",
  terminator: "Terminator",
  logic: "Logic gate",
};

function BaseNode({ data, shape }) {
  return (
    <div className={`part-node part-${data.type}`} style={{ borderColor: data.color }}>
      <Handle type="target" position={Position.Left} />
      <div className="part-glyph" style={{ background: data.color }}>
        {shape}
      </div>
      <div className="part-body">
        <div className="part-label">{data.label}</div>
        <div className="part-type">
          {TYPE_LABEL[data.type] || data.type}
          {data.reporter ? " · reporter" : ""}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const PromoterNode = (p) => <BaseNode {...p} shape="→" />;
const CdsNode = (p) => <BaseNode {...p} shape="▭" />;
const InducerNode = (p) => <BaseNode {...p} shape="◆" />;
const RbsNode = (p) => <BaseNode {...p} shape="○" />;
const TerminatorNode = (p) => <BaseNode {...p} shape="⊤" />;

// The logic gate is not a physical part, so it gets its own glyph (& = AND-ish).
const LogicNode = (p) => <BaseNode {...p} shape="⋈" />;

export const nodeTypes = {
  promoter: PromoterNode,
  cds: CdsNode,
  inducer: InducerNode,
  rbs: RbsNode,
  terminator: TerminatorNode,
  logic: LogicNode,
};
