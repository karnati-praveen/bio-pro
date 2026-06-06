// Feature 9: DNA ordering — IDT gBlock and Twist Bioscience integration.

import { useState } from "react";
import { generateOrder } from "../api/client.js";

export default function OrderPanel({ result }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState(null);

  if (!result) return null;

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateOrder(result);
      setOrders(data.orders || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card order-panel">
      <h2>Order DNA</h2>
      <p className="muted" style={{ marginBottom: 10 }}>
        Get pricing and ordering links for IDT (gBlocks) and Twist Bioscience gene fragments.
      </p>

      <button className="compile-btn small" onClick={fetchOrders} disabled={loading}>
        {loading ? "Generating…" : "Get order details ▶"}
      </button>

      {error && <div className="error-box">{error}</div>}

      {orders && orders.length === 0 && (
        <p className="muted">No sequences available for ordering (parts may lack sequences).</p>
      )}

      {orders && orders.map((order, i) => (
        <div key={i} className="order-item">
          <div className="order-header">
            <strong>{order.tu_name}</strong>
            <span className="badge">{order.length_bp} bp</span>
          </div>

          <div className="vendor-cards">
            {/* IDT */}
            <div className="vendor-card idt">
              <div className="vendor-name">IDT (gBlocks)</div>
              <div className="vendor-detail">
                <span>Fragments: {order.idt?.n_fragments}</span>
                <span className="price">${order.idt?.estimated_cost_usd?.toFixed(2)}</span>
                <span className="muted">{order.idt?.turnaround}</span>
              </div>
              {order.idt?.idt_url && (
                <a
                  href={order.idt.idt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="order-btn"
                >
                  Open IDT order →
                </a>
              )}
            </div>

            {/* Twist */}
            <div className="vendor-card twist">
              <div className="vendor-name">Twist Bioscience</div>
              <div className="vendor-detail">
                <span>Fragments: {order.twist?.n_fragments}</span>
                <span className="price">${order.twist?.estimated_cost_usd?.toFixed(2)}</span>
                <span className="muted">{order.twist?.turnaround}</span>
              </div>
              <a
                href="https://www.twistbioscience.com/products/genes"
                target="_blank"
                rel="noreferrer"
                className="order-btn"
              >
                Open Twist →
              </a>
            </div>
          </div>

          {/* Sequence preview */}
          <details style={{ marginTop: 6 }}>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
              View sequence ({order.length_bp} bp)
            </summary>
            <code className="seq-block">
              {(order.sequence || "").slice(0, 300)}
              {(order.sequence || "").length > 300 ? "…" : ""}
            </code>
          </details>
        </div>
      ))}
    </div>
  );
}
