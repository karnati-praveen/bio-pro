import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { chemReaction, chemKinetics } from "../../shared/lib/api/client.js";

const COLORS = ["#2a9d8f", "#e63946", "#4895ef", "#f0883e", "#9d4edd", "#457b9d"];

// Module 6 — Reaction Designer. Enter reactant/product/reagent SMILES → reaction
// SMILES; define a mass-action network → kinetics ODE plotted with Recharts.
export default function ReactionEditor() {
  const [reactants, setReactants] = useState("CCO, OC(=O)C");
  const [products, setProducts] = useState("CCOC(C)=O");
  const [reagents, setReagents] = useState("[H+]");
  const [rsmiles, setRsmiles] = useState(null);

  const [species, setSpecies] = useState("A=1, B=1, C=0");
  const [reactions, setReactions] = useState("A + B -> C @ 0.5");
  const [sim, setSim] = useState(null);
  const [err, setErr] = useState(null);

  const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const buildReaction = async () => {
    const r = await chemReaction(split(reactants), split(products), split(reagents));
    setRsmiles(r.reaction_smiles);
  };

  const runKinetics = async () => {
    setErr(null);
    try {
      const sp = {};
      for (const tok of split(species)) {
        const [name, val] = tok.split("=").map((x) => x.trim());
        sp[name] = Number(val) || 0;
      }
      const rxns = species && reactions.split("\n").map((line) => parseReaction(line)).filter(Boolean);
      const data = await chemKinetics(rxns, sp, 50);
      setSim(data);
    } catch (e) { setErr(e.message); }
  };

  const chartData = sim?.t.map((t, i) => {
    const row = { t: Number(t.toFixed(1)) };
    sim.series.forEach((s) => { row[s.name] = s.values[i]; });
    return row;
  });

  return (
    <div className="rxn-editor">
      <section className="rxn-section">
        <h3>Reaction SMILES</h3>
        <label className="rxn-row">Reactants<input value={reactants} onChange={(e) => setReactants(e.target.value)} /></label>
        <label className="rxn-row">Reagents / conditions<input value={reagents} onChange={(e) => setReagents(e.target.value)} /></label>
        <label className="rxn-row">Products<input value={products} onChange={(e) => setProducts(e.target.value)} /></label>
        <button className="btn primary" onClick={buildReaction}>Build reaction →</button>
        {rsmiles && <code className="rxn-out">{rsmiles}</code>}
      </section>

      <section className="rxn-section">
        <h3>Kinetics</h3>
        <label className="rxn-row">Species (name=conc)<input value={species} onChange={(e) => setSpecies(e.target.value)} /></label>
        <label className="rxn-row">Reactions (one per line, e.g. <code>A + B -&gt; C @ 0.5</code>)
          <textarea rows={3} value={reactions} onChange={(e) => setReactions(e.target.value)} />
        </label>
        <button className="btn primary" onClick={runKinetics}>Run kinetics ▶</button>
        {err && <div className="dsl-error">{err}</div>}
        {chartData && (
          <div className="rxn-plot">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                {sim.series.map((s, i) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

// Parse "A + B -> C @ 0.5" (or "S -> P @ mm vmax=1 km=0.5").
function parseReaction(line) {
  const txt = line.trim();
  if (!txt) return null;
  const [body, rateStr] = txt.split("@").map((x) => x.trim());
  const [lhs, rhs] = body.split(/->|=>/).map((x) => x.trim());
  const reactants = lhs.split("+").map((x) => x.trim()).filter(Boolean);
  const products = rhs.split("+").map((x) => x.trim()).filter(Boolean);
  if (rateStr && rateStr.startsWith("mm")) {
    const vmax = Number((rateStr.match(/vmax=([\d.]+)/) || [])[1]) || 1;
    const km = Number((rateStr.match(/km=([\d.]+)/) || [])[1]) || 1;
    return { type: "mm", substrate: reactants[0], product: products[0], vmax, km };
  }
  return { reactants, products, k: Number(rateStr) || 1 };
}
