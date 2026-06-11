import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  chemReaction, chemKinetics, chemBalance, chemStoichiometry,
} from "../../shared/lib/api/client.js";

const COLORS = ["var(--accent)", "var(--error)", "var(--feat-promoter)", "var(--modified)", "var(--feat-operator)", "var(--link)"];

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

  // Balance & stoichiometry (formula-based, not SMILES).
  const [bReactants, setBReactants] = useState("C3H8, O2");
  const [bProducts, setBProducts] = useState("CO2, H2O");
  const [amounts, setAmounts] = useState("C3H8=44 g, O2=160 g");
  const [actual, setActual] = useState("");
  const [balanced, setBalanced] = useState(null);
  const [stoich, setStoich] = useState(null);
  const [chemErr, setChemErr] = useState(null);

  const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const doBalance = async () => {
    setChemErr(null); setStoich(null);
    try {
      setBalanced(await chemBalance(split(bReactants), split(bProducts)));
    } catch (e) { setChemErr(e.message); setBalanced(null); }
  };

  const doStoich = async () => {
    setChemErr(null);
    try {
      const amt = parseAmounts(amounts);
      const act = parseAmounts(actual);
      const res = await chemStoichiometry(
        split(bReactants), split(bProducts), amt,
        Object.keys(act).length ? act : null,
      );
      setBalanced(res.balanced);
      setStoich(res);
    } catch (e) { setChemErr(e.message); }
  };

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

      <section className="rxn-section">
        <h3>Balance &amp; Stoichiometry</h3>
        <label className="rxn-row">Reactants (formulas)<input value={bReactants} onChange={(e) => setBReactants(e.target.value)} /></label>
        <label className="rxn-row">Products (formulas)<input value={bProducts} onChange={(e) => setBProducts(e.target.value)} /></label>
        <label className="rxn-row">Amounts (<code>formula=value g|mg|mol|mmol</code>)
          <input value={amounts} onChange={(e) => setAmounts(e.target.value)} />
        </label>
        <label className="rxn-row">Actual yield (optional, same format)
          <input value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        <div className="rxn-btns">
          <button className="btn" onClick={doBalance}>Balance</button>
          <button className="btn primary" onClick={doStoich}>Stoichiometry →</button>
        </div>
        {chemErr && <div className="dsl-error">{chemErr}</div>}
        {balanced && <code className="rxn-out">{balanced.equation}</code>}
        {stoich && (
          <div className="stoich-tables">
            <table className="stoich-table">
              <thead>
                <tr><th>Reagent</th><th>Coeff</th><th>Mol</th><th>Grams</th><th>Consumed (mol)</th><th>Excess (mol)</th></tr>
              </thead>
              <tbody>
                {stoich.reagents.map((r) => (
                  <tr key={r.formula} className={r.limiting ? "limiting" : ""}>
                    <td>{r.formula}{r.limiting && <span className="tag">limiting</span>}</td>
                    <td>{r.coeff}</td>
                    <td>{fmt(r.moles)}</td>
                    <td>{fmt(r.grams)}</td>
                    <td>{fmt(r.consumed_moles)}</td>
                    <td>{fmt(r.excess_moles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="stoich-table">
              <thead>
                <tr><th>Product</th><th>Coeff</th><th>Theo. mol</th><th>Theo. g</th><th>% yield</th></tr>
              </thead>
              <tbody>
                {stoich.products.map((p) => (
                  <tr key={p.formula}>
                    <td>{p.formula}</td>
                    <td>{p.coeff}</td>
                    <td>{fmt(p.theoretical_moles)}</td>
                    <td>{fmt(p.theoretical_grams)}</td>
                    <td>{p.percent_yield != null ? `${p.percent_yield}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Parse "C3H8=44 g, O2=160 mol" → { C3H8: {grams:44}, O2: {moles:160} }.
function parseAmounts(s) {
  const out = {};
  for (const tok of (s || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [formula, rest] = tok.split("=").map((x) => x.trim());
    if (!formula || !rest) continue;
    const m = rest.match(/^([\d.]+)\s*(mmol|mol|mg|g)?$/i);
    if (!m) continue;
    const val = Number(m[1]);
    const unit = (m[2] || "g").toLowerCase();
    if (unit === "mmol") out[formula] = { moles: val / 1000 };
    else if (unit === "mol") out[formula] = { moles: val };
    else if (unit === "mg") out[formula] = { grams: val / 1000 };
    else out[formula] = { grams: val };
  }
  return out;
}

const fmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });

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
