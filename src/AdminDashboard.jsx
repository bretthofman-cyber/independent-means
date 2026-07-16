import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

const FEATURE_LABELS = {
  probability_view:      "Probability view",
  scenario_comparison:   "Scenario comparison",
  custom_assumptions:    "Custom assumptions",
  debt_recycling:        "Debt recycling",
  carry_forward_cap:     "Carry-forward cap",
  franking_credits:      "Franking credits",
  pdf_export:            "PDF export",
  multi_plan:            "Multiple plans",
  strategy_centre:       "Strategy Centre",
  csv_export:            "CSV export",
  improve_my_plan:       "Improve my plan",
  upgrade_banner:        "Upgrade banner",
};

function label(feature) {
  return FEATURE_LABELS[feature] ?? feature;
}

function fmt(n) {
  return n == null ? "—" : n.toLocaleString();
}

function pct(n) {
  return n == null ? "—" : `${n}%`;
}

// ── Date range helpers ────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { from: isoDate(from), to: isoDate(to) };
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function adminFetch(action, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");

  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/admin-stats?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function GateClicksPanel({ from, to }) {
  const [rows, setRows]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    adminFetch("gate_clicks", { from, to })
      .then(r => setRows(r.data))
      .catch(e => setError(e.message));
  }, [from, to]);

  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Gate clicks by feature</div>
      {error && <div style={errorStyle}>{error}</div>}
      {!rows && !error && <div style={dimStyle}>Loading...</div>}
      {rows && rows.length === 0 && <div style={dimStyle}>No gate clicks in this period.</div>}
      {rows && rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Feature</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Clicks</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const total = rows.reduce((s, x) => s + x.count, 0);
              return (
                <tr key={r.feature} style={{ background: i % 2 === 0 ? "#FBFAF6" : "white" }}>
                  <td style={tdStyle}>{label(r.feature)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmt(r.count)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#8A8270" }}>
                    {total > 0 ? `${Math.round((r.count / total) * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FunnelPanel({ from, to }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    adminFetch("funnel", { from, to })
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, [from, to]);

  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Conversion funnel</div>
      {error && <div style={errorStyle}>{error}</div>}
      {!data && !error && <div style={dimStyle}>Loading...</div>}
      {data && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Gate clicks",  value: fmt(data.gate_users),  sub: "unique users" },
            { label: "Trials started", value: fmt(data.trial_users), sub: `${pct(data.gate_to_trial)} of gate users` },
            { label: "Subscriptions", value: fmt(data.paid_users),  sub: `${pct(data.trial_to_paid)} of trial users` },
          ].map(item => (
            <div key={item.label} style={{
              flex: "1 1 140px",
              background: "#FBFAF6", border: "1.5px solid #ECE7DB",
              borderRadius: 10, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontFamily: "Spectral, serif", fontSize: 28, color: "#2E4A3D", marginBottom: 2 }}>
                {item.value}
              </div>
              <div style={{ fontSize: 11, color: "#8A8270" }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrialConversionPanel() {
  const [rows, setRows]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminFetch("trial_conversion")
      .then(r => setRows(r.data))
      .catch(e => setError(e.message));
  }, []);

  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Trial conversion by originating feature</div>
      <div style={{ fontSize: 11, color: "#8A8270", marginBottom: 12 }}>
        All time: based on the feature that triggered the user's trial
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      {!rows && !error && <div style={dimStyle}>Loading...</div>}
      {rows && rows.length === 0 && <div style={dimStyle}>No trial data yet.</div>}
      {rows && rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Originating feature</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Trials</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Paid</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.feature} style={{ background: i % 2 === 0 ? "#FBFAF6" : "white" }}>
                <td style={tdStyle}>{label(r.feature)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(r.trial_count)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(r.paid_count)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: r.conversion_rate >= 20 ? "#2E4A3D" : "#21241E" }}>
                  {pct(r.conversion_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle  = { background: "white", border: "1.5px solid #ECE7DB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 };
const panelTitle  = { fontSize: 13, fontWeight: 600, color: "#21241E", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.05em" };
const thStyle     = { padding: "6px 8px", textAlign: "left", fontSize: 11, color: "#8A8270", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1.5px solid #ECE7DB" };
const tdStyle     = { padding: "8px 8px", borderBottom: "1px solid #F0EDE6", color: "#21241E" };
const dimStyle    = { color: "#8A8270", fontSize: 13 };
const errorStyle  = { color: "#9a3922", fontSize: 13 };

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard({ onClose }) {
  const [range, setRange] = useState(defaultRange);

  const setFrom = useCallback(v => setRange(r => ({ ...r, from: v })), []);
  const setTo   = useCallback(v => setRange(r => ({ ...r, to: v   })), []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#F5F2EB",
      overflowY: "auto",
      zIndex: 1400,
    }}>
      {/* Header */}
      <div style={{
        background: "#2E4A3D",
        padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ fontFamily: "Spectral, serif", fontSize: 18, color: "#F5F2EB" }}>
          Analytics — Independent Means
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#9DB0A1", fontSize: 20, cursor: "pointer", padding: "2px 6px" }}
        >✕</button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 48px" }}>

        {/* Date range */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6B6655", fontWeight: 500 }}>Date range</span>
          <input
            type="date"
            value={range.from}
            onChange={e => setFrom(e.target.value)}
            style={dateInputStyle}
          />
          <span style={{ fontSize: 12, color: "#8A8270" }}>to</span>
          <input
            type="date"
            value={range.to}
            onChange={e => setTo(e.target.value)}
            style={dateInputStyle}
          />
          {[
            { label: "7d",  days: 7  },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ].map(({ label: l, days }) => (
            <button
              key={l}
              onClick={() => {
                const to = new Date();
                const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                setRange({ from: isoDate(from), to: isoDate(to) });
              }}
              style={{
                fontSize: 11, fontWeight: 500,
                background: "none", border: "1px solid #D8D2C4",
                borderRadius: 6, padding: "3px 8px",
                cursor: "pointer", color: "#6B6655", fontFamily: "inherit",
              }}
            >{l}</button>
          ))}
        </div>

        <FunnelPanel     from={range.from} to={range.to} />
        <GateClicksPanel from={range.from} to={range.to} />
        <TrialConversionPanel />

      </div>
    </div>
  );
}

const dateInputStyle = {
  fontSize: 12, fontFamily: "inherit",
  border: "1px solid #D8D2C4", borderRadius: 6,
  padding: "4px 8px", background: "white", color: "#21241E",
};
