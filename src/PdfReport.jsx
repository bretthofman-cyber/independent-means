import { useMemo } from "react";
import { runEngine } from "./engine.js";
import { deriveAssetTotals } from "./assetUtils.js";
import { applyMaxedSS } from "./AnalysisStage.jsx";

const PIN  = "#2E4A3D";
const PAP  = "#F5F2EB";
const GOLD = "#C2A06B";
const SAGE = "#9DB0A1";
const INK  = "#21241E";
const CARD = "#FBFAF6";
const STN  = "#D8D2C4";
const DIM  = "#8A8270";
const MID  = "#6B6655";

function fmt(n) {
  if (n == null || isNaN(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

function fmtFull(n) {
  if (n == null || isNaN(n)) return "";
  return "$" + Math.round(n).toLocaleString("en-AU");
}

function reportDate() {
  return new Date().toLocaleDateString("en-AU", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ─── CHART: NET WORTH TRAJECTORY ─────────────────────────────────────────────

function PdfNetWorthChart({ trajectory, retirementAge }) {
  if (!trajectory || trajectory.length < 2) return null;

  const W = 520, H = 200;
  const mg = { top: 24, right: 16, bottom: 32, left: 64 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top - mg.bottom;

  const minAge = trajectory[0].age;
  const maxAge = trajectory[trajectory.length - 1].age;

  const nws   = trajectory.map(t => t.netWorth);
  const sups  = trajectory.map(t => t.superBalance  || 0);
  const props = trajectory.map(t => t.propertyValue || 0);

  const allVals = [...nws, ...sups, ...props].filter(v => v > 0);
  const rawMin  = Math.min(0, ...nws);
  const rawMax  = Math.max(1, ...allVals);
  const range   = rawMax - rawMin || 1;

  const xS  = age => mg.left + ((age - minAge) / (maxAge - minAge)) * cW;
  const yS  = v   => mg.top  + cH - ((v - rawMin) / range) * cH;
  const mkP = key => trajectory.map((t, i) =>
    `${i === 0 ? "M" : "L"} ${xS(t.age).toFixed(1)} ${yS(t[key] || 0).toFixed(1)}`
  ).join(" ");

  const nwPath   = mkP("netWorth");
  const supPath  = mkP("superBalance");
  const propPath = mkP("propertyValue");
  const areaPath =
    `M ${xS(minAge).toFixed(1)} ${yS(0).toFixed(1)} ` +
    trajectory.map(t => `L ${xS(t.age).toFixed(1)} ${yS(t.netWorth).toFixed(1)}`).join(" ") +
    ` L ${xS(maxAge).toFixed(1)} ${yS(0).toFixed(1)} Z`;

  const retX     = xS(retirementAge);
  const showRet  = retX >= mg.left + 4 && retX <= W - mg.right - 4;
  const hasSuper = Math.max(...sups) > 1000;
  const hasProp  = Math.max(...props) > 1000;

  const yTicks = [0, 1, 2, 3, 4].map(i => ({
    v: rawMin + (range / 4) * i,
    y: yS(rawMin + (range / 4) * i),
  }));

  const xLabels = [minAge, retirementAge, maxAge]
    .filter((a, idx, arr) => arr.indexOf(a) === idx && a >= minAge && a <= maxAge)
    .sort((a, b) => a - b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="pdfNwGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={PIN} stopOpacity="0.18" />
          <stop offset="100%" stopColor={PIN} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yTicks.map(({ v, y }, i) => (
        <g key={i}>
          <line x1={mg.left} x2={W - mg.right} y1={y} y2={y}
            stroke={STN} strokeWidth="0.5" />
          <text x={mg.left - 6} y={y + 4} textAnchor="end"
            fontSize="9" fill={DIM} fontFamily="Albert Sans, sans-serif">
            {fmt(v)}
          </text>
        </g>
      ))}

      {showRet && (
        <>
          <line x1={retX} x2={retX} y1={mg.top} y2={H - mg.bottom}
            stroke={GOLD} strokeWidth="1" strokeDasharray="3 2" />
          <text x={retX + 4} y={mg.top + 11}
            fontSize="8" fill={GOLD} fontFamily="Albert Sans, sans-serif">
            Retire
          </text>
        </>
      )}

      <path d={areaPath} fill="url(#pdfNwGrad)" />
      {hasSuper && <path d={supPath}  fill="none" stroke="#4472a8" strokeWidth="1.3"
        strokeDasharray="3 2" opacity="0.7" />}
      {hasProp  && <path d={propPath} fill="none" stroke={GOLD}    strokeWidth="1.3"
        strokeDasharray="5 3" opacity="0.7" />}
      <path d={nwPath} fill="none" stroke={PIN} strokeWidth="2.2" />

      <line x1={mg.left} x2={W - mg.right} y1={H - mg.bottom} y2={H - mg.bottom}
        stroke={STN} strokeWidth="0.8" />
      {xLabels.map(age => (
        <text key={age} x={xS(age)} y={H - mg.bottom + 14}
          textAnchor="middle" fontSize="9" fill={DIM}
          fontFamily="Albert Sans, sans-serif">
          {age}
        </text>
      ))}

      {hasSuper && (
        <g>
          <line x1={mg.left + 4} x2={mg.left + 20} y1={mg.top + 6} y2={mg.top + 6}
            stroke="#4472a8" strokeWidth="1.3" strokeDasharray="3 2" />
          <text x={mg.left + 24} y={mg.top + 10}
            fontSize="8" fill={DIM} fontFamily="Albert Sans, sans-serif">Super</text>
        </g>
      )}
      {hasProp && (
        <g>
          <line x1={mg.left + (hasSuper ? 64 : 4)} x2={mg.left + (hasSuper ? 80 : 20)}
            y1={mg.top + 6} y2={mg.top + 6}
            stroke={GOLD} strokeWidth="1.3" strokeDasharray="5 3" />
          <text x={mg.left + (hasSuper ? 84 : 24)} y={mg.top + 10}
            fontSize="8" fill={DIM} fontFamily="Albert Sans, sans-serif">Property</text>
        </g>
      )}
      <g>
        <line x1={mg.left + (hasSuper && hasProp ? 128 : hasSuper || hasProp ? 64 : 4)}
          x2={mg.left + (hasSuper && hasProp ? 148 : hasSuper || hasProp ? 84 : 24)}
          y1={mg.top + 6} y2={mg.top + 6}
          stroke={PIN} strokeWidth="2.2" />
        <text x={mg.left + (hasSuper && hasProp ? 152 : hasSuper || hasProp ? 88 : 28)}
          y={mg.top + 10}
          fontSize="8" fill={DIM} fontFamily="Albert Sans, sans-serif">Net worth</text>
      </g>
    </svg>
  );
}

// ─── CHART: MONTE CARLO FAN ───────────────────────────────────────────────────

function PdfFanChart({ fanBands }) {
  if (!fanBands || fanBands.length < 2) return null;

  const W = 520, H = 160;
  const mg = { top: 16, right: 16, bottom: 28, left: 64 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top - mg.bottom;

  const minAge = fanBands[0].age;
  const maxAge = fanBands[fanBands.length - 1].age;
  const maxVal = Math.max(1, ...fanBands.map(b => b.p90));

  const xS = age => mg.left + ((age - minAge) / (maxAge - minAge)) * cW;
  const yS = v   => mg.top  + cH - (Math.max(0, v) / maxVal) * cH;

  const areaP = (lo, hi) => {
    const fwd = fanBands.map((b, i) =>
      `${i === 0 ? "M" : "L"} ${xS(b.age).toFixed(1)} ${yS(b[hi]).toFixed(1)}`
    ).join(" ");
    const rev = fanBands.slice().reverse().map(b =>
      `L ${xS(b.age).toFixed(1)} ${yS(b[lo]).toFixed(1)}`
    ).join(" ");
    return `${fwd} ${rev} Z`;
  };

  const lineP = key => fanBands.map((b, i) =>
    `${i === 0 ? "M" : "L"} ${xS(b.age).toFixed(1)} ${yS(b[key]).toFixed(1)}`
  ).join(" ");

  const yTicks = [0, 1, 2, 3].map(i => ({
    v: (maxVal / 3) * i,
    y: yS((maxVal / 3) * i),
  }));

  const xLabels = [minAge, maxAge];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {yTicks.map(({ v, y }, i) => (
        <g key={i}>
          <line x1={mg.left} x2={W - mg.right} y1={y} y2={y}
            stroke={STN} strokeWidth="0.5" />
          <text x={mg.left - 6} y={y + 4} textAnchor="end"
            fontSize="8" fill={DIM} fontFamily="Albert Sans, sans-serif">
            {fmt(v)}
          </text>
        </g>
      ))}
      <path d={areaP("p10", "p90")} fill="rgba(194,160,107,0.10)" />
      <path d={areaP("p25", "p75")} fill="rgba(194,160,107,0.22)" />
      <path d={lineP("p50")} fill="none"
        stroke={GOLD} strokeWidth="1.6" strokeDasharray="4 3" />
      <line x1={mg.left} x2={W - mg.right} y1={H - mg.bottom} y2={H - mg.bottom}
        stroke={STN} strokeWidth="0.8" />
      {xLabels.map(age => (
        <text key={age} x={xS(age)} y={H - mg.bottom + 14}
          textAnchor="middle" fontSize="9" fill={DIM}
          fontFamily="Albert Sans, sans-serif">
          {age}
        </text>
      ))}
      <text x={mg.left + 4} y={mg.top + 10}
        fontSize="8" fill={GOLD} fontFamily="Albert Sans, sans-serif">
        Median (p50)
      </text>
      <text x={mg.left + 4} y={mg.top + 20}
        fontSize="7" fill={DIM} fontFamily="Albert Sans, sans-serif">
        Shaded: p10–p90 and p25–p75 bands
      </text>
    </svg>
  );
}

// ─── PAGE: DISCLAIMER FOOTER ─────────────────────────────────────────────────

function PageFooter({ name }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      padding: "6px 20mm", borderTop: `1px solid ${STN}`,
      background: "white",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div style={{
        fontSize: 7.5, color: DIM, lineHeight: 1.4, flex: 1,
        fontFamily: "Albert Sans, sans-serif",
      }}>
        General information only. Not personal financial advice. Independent Means is an educational modelling tool.
        Projections are illustrative estimates based on entered inputs and standard assumptions.
        Consult a licensed Australian financial adviser (AFSL holder) before making financial decisions.
        {name ? ` Prepared for ${name}.` : ""}
      </div>
      <div style={{ fontSize: 7.5, color: DIM, marginLeft: 12,
        fontFamily: "Albert Sans, sans-serif", whiteSpace: "nowrap" }}>
        independentmeans.com.au
      </div>
    </div>
  );
}

// ─── METRIC CARD ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${STN}`, borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div style={{
        fontSize: 9, color: DIM, textTransform: "uppercase",
        letterSpacing: "0.07em", marginBottom: 4,
        fontFamily: "Albert Sans, sans-serif",
      }}>{label}</div>
      <div style={{
        fontFamily: "Spectral, serif", fontSize: 20, color: PIN,
        fontWeight: 500, marginBottom: sub ? 2 : 0,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: DIM, fontFamily: "Albert Sans, sans-serif" }}>{sub}</div>}
    </div>
  );
}

// ─── PAGE 1: COVER ────────────────────────────────────────────────────────────

function CoverPage({ data }) {
  const name = [
    data.firstName,
    data.hasPartner === "yes" && data.partnerName ? `& ${data.partnerName}` : null,
  ].filter(Boolean).join(" ");

  return (
    <div style={{
      background: PIN,
      minHeight: "100vh",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "60px 60px 36px",
      pageBreakAfter: "always", breakAfter: "page",
      boxSizing: "border-box",
    }}>
      <div>
        <div style={{
          fontFamily: "Spectral, serif", fontSize: 30, color: PAP,
          marginBottom: 6, letterSpacing: "-0.01em",
        }}>
          Independent<span style={{ color: GOLD }}> Means</span>
        </div>
        <div style={{
          fontSize: 10, color: SAGE, letterSpacing: "0.12em",
          textTransform: "uppercase", marginBottom: 56,
          fontFamily: "Albert Sans, sans-serif",
        }}>
          Personal Financial Modelling
        </div>

        <div style={{
          width: 48, height: 2, background: GOLD, marginBottom: 32,
        }} />

        <div style={{
          fontFamily: "Spectral, serif", fontSize: 26, color: PAP,
          marginBottom: 10, fontWeight: 400,
        }}>
          Financial Modelling Report
        </div>
        {name && (
          <div style={{
            fontSize: 15, color: GOLD, marginBottom: 8,
            fontFamily: "Albert Sans, sans-serif",
          }}>
            Prepared for {name}
          </div>
        )}
        <div style={{
          fontSize: 12, color: SAGE, fontFamily: "Albert Sans, sans-serif",
        }}>
          Generated {reportDate()}
        </div>
      </div>

      <div style={{
        borderTop: "1px solid rgba(157,176,161,0.35)",
        paddingTop: 16,
        fontSize: 8.5, color: "#6B8872", lineHeight: 1.7,
        fontFamily: "Albert Sans, sans-serif",
      }}>
        General information only. Not personal financial advice.
        This report presents modelling projections based on the inputs entered and a set of standard
        Australian market assumptions. It does not constitute personal financial advice under the
        Corporations Act 2001 (Cth). Projections are illustrative estimates and actual outcomes will
        differ. For advice tailored to your personal circumstances, consult a licensed Australian
        financial adviser (AFSL holder).
      </div>
    </div>
  );
}

// ─── PAGE 2: FINANCIAL POSITION ───────────────────────────────────────────────

function FinancialPositionPage({ data, engine }) {
  const m  = engine?.metrics;
  const tr = engine?.trajectory || [];
  const last = tr[tr.length - 1];

  const cards = [
    m?.fireNumber         && { label: "FIRE Number",        value: fmtFull(m.fireNumber),       sub: "Target net worth at retirement" },
    m?.projectedSuper     && { label: "Projected Super",    value: fmtFull(m.projectedSuper),   sub: `At age ${data.retirementAge}` },
    engine?.mortgage?.debtFreeYear && { label: "Debt-Free Year", value: String(engine.mortgage.debtFreeYear), sub: "PPOR mortgage cleared" },
    last?.netWorth != null && { label: "Net Worth at " + last?.age, value: fmtFull(last?.netWorth), sub: "End of projection" },
  ].filter(Boolean);

  const retAge = parseInt(data.retirementAge) || 65;

  return (
    <div style={{
      padding: "40px 40px 80px", pageBreakAfter: "always", breakAfter: "page",
      boxSizing: "border-box", minHeight: "100vh",
    }}>
      <SectionHeader label="Financial Position" />

      <div style={{
        display: "grid",
        gridTemplateColumns: cards.length >= 3 ? "repeat(2, 1fr)" : `repeat(${cards.length}, 1fr)`,
        gap: 10, marginBottom: 24,
      }}>
        {cards.map((c, i) => <MetricCard key={i} label={c.label} value={c.value} sub={c.sub} />)}
      </div>

      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: DIM, marginBottom: 10,
        fontFamily: "Albert Sans, sans-serif",
      }}>
        Net Worth Trajectory — Base Scenario
      </div>
      <div style={{
        background: CARD, border: `1.5px solid ${STN}`, borderRadius: 12,
        padding: "16px 16px 12px", marginBottom: 0,
      }}>
        <PdfNetWorthChart trajectory={tr} retirementAge={retAge} />
      </div>
    </div>
  );
}

// ─── PAGE 3: RETIREMENT PROJECTIONS ──────────────────────────────────────────

function RetirementPage({ data, engine }) {
  const m    = engine?.metrics;
  const mc   = engine?.monteCarlo;
  const asmn = engine?.assumptions;

  const retAge   = parseInt(data.retirementAge) || 65;
  const lifeExp  = parseInt(data.lifeExpectancy) || 90;
  const spending = m?.targetRetirementSpending ?? parseFloat(String(data.targetRetirementSpending || "").replace(/,/g, ""));

  const outcomes = [
    spending > 0      && { label: "Annual retirement spending",   value: fmtFull(spending) },
    m?.projectedSuper && { label: "Projected super at retirement", value: fmtFull(m.projectedSuper) },
    m?.fireNumber     && { label: "Required FIRE number",         value: fmtFull(m.fireNumber) },
    m?.depletionAge   && m.depletionAge < lifeExp
      ? { label: "Estimated balance depletion", value: `Age ${m.depletionAge}`, warn: true }
      : m?.projectedSuper > 0
        ? { label: "Funded to",                   value: `Age ${lifeExp}+` }
        : null,
    mc?.successRate != null && { label: "Monte Carlo success rate",
      value: `${mc.successRate}%`, sub: `of ${mc.iterations?.toLocaleString() || 1000} simulations` },
  ].filter(Boolean);

  const assumptionRows = asmn ? [
    { label: "Investment return",  value: `${asmn.returnRate}% p.a.` },
    { label: "Inflation",          value: `${asmn.inflation}% p.a.` },
    { label: "Property growth",    value: `${asmn.propertyGrowth}% p.a.` },
    { label: "Safe withdrawal",    value: `${asmn.safeWithdrawal}% p.a.` },
    { label: "Scenario",           value: (asmn.label || data.activeScenario || "Base") },
  ] : [];

  return (
    <div style={{ padding: "40px 40px 80px", boxSizing: "border-box" }}>
      <SectionHeader label="Retirement Projections" />

      <div style={{
        display: "grid",
        gridTemplateColumns: outcomes.length >= 3 ? "repeat(2, 1fr)" : `repeat(${Math.max(outcomes.length, 1)}, 1fr)`,
        gap: 10, marginBottom: 28,
      }}>
        {outcomes.map((o, i) => (
          <div key={i} style={{
            background: o.warn ? "#FDF3F0" : CARD,
            border: `1px solid ${o.warn ? "#E8C4BA" : STN}`,
            borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 9, color: o.warn ? "#9a3922" : DIM,
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4,
              fontFamily: "Albert Sans, sans-serif",
            }}>{o.label}</div>
            <div style={{
              fontFamily: "Spectral, serif", fontSize: 20,
              color: o.warn ? "#9a3922" : PIN, fontWeight: 500,
            }}>{o.value}</div>
            {o.sub && <div style={{ fontSize: 9, color: DIM, marginTop: 2,
              fontFamily: "Albert Sans, sans-serif" }}>{o.sub}</div>}
          </div>
        ))}
      </div>

      {assumptionRows.length > 0 && (
        <>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            textTransform: "uppercase", color: DIM, marginBottom: 10,
            fontFamily: "Albert Sans, sans-serif",
          }}>
            Modelling Assumptions
          </div>
          <div style={{
            background: PAP, borderRadius: 10, padding: "14px 18px",
          }}>
            {assumptionRows.map((r, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: i < assumptionRows.length - 1 ? `1px solid ${STN}` : "none",
              }}>
                <div style={{ fontSize: 11, color: MID,
                  fontFamily: "Albert Sans, sans-serif" }}>{r.label}</div>
                <div style={{ fontSize: 11, color: INK, fontWeight: 500,
                  fontFamily: "Albert Sans, sans-serif" }}>{r.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{
        marginTop: 28, background: PAP, borderRadius: 10,
        padding: "12px 16px", fontSize: 9, color: MID,
        lineHeight: 1.6, fontFamily: "Albert Sans, sans-serif",
      }}>
        Projections assume consistent market returns, inflation, and contribution rates over the
        modelling period. Actual outcomes depend on market volatility, legislative changes,
        personal circumstances, and decisions not captured in this model. All figures are nominal
        (not inflation-adjusted). Review your projections annually with a licensed financial adviser.
      </div>
    </div>
  );
}

// ─── PAGE 4: SCENARIO ANALYSIS (PREMIUM) ─────────────────────────────────────

function ScenarioPage({ data, engines, monteCarlo }) {
  const retAge = parseInt(data.retirementAge) || 65;
  const lifeExp = parseInt(data.lifeExpectancy) || 90;

  const scenarios = [
    { key: "base",         label: "Base",         color: PIN },
    { key: "conservative", label: "Conservative", color: "#9a3922" },
    { key: "aggressive",   label: "Aggressive",   color: "#2A6040" },
  ];

  const rows = [
    {
      label: "Projected super at retirement",
      fn: e => fmtFull(e?.metrics?.projectedSuper),
    },
    {
      label: "FIRE number required",
      fn: e => fmtFull(e?.metrics?.fireNumber),
    },
    {
      label: "Funded to age",
      fn: e => {
        const dep = e?.metrics?.depletionAge;
        return dep && dep < lifeExp ? `Age ${dep} (depletes)` : `Age ${lifeExp}+`;
      },
    },
    {
      label: "Final net worth",
      fn: e => {
        const tr = e?.trajectory || [];
        return tr.length ? fmtFull(tr[tr.length - 1].netWorth) : "";
      },
    },
  ];

  return (
    <div style={{ padding: "40px 40px 80px", boxSizing: "border-box" }}>
      <SectionHeader label="Scenario Analysis" />

      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: 11, marginBottom: 28,
        fontFamily: "Albert Sans, sans-serif",
      }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 12px",
              background: PAP, fontSize: 9, color: MID,
              textTransform: "uppercase", letterSpacing: "0.07em",
              borderBottom: `1.5px solid ${STN}` }}>
              Outcome
            </th>
            {scenarios.map(s => (
              <th key={s.key} style={{
                textAlign: "right", padding: "8px 12px",
                background: PAP, fontSize: 9, color: s.color,
                textTransform: "uppercase", letterSpacing: "0.07em",
                borderBottom: `1.5px solid ${STN}`,
              }}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? CARD : "white" }}>
              <td style={{ padding: "9px 12px", color: MID, borderBottom: `1px solid ${STN}` }}>
                {row.label}
              </td>
              {scenarios.map(s => (
                <td key={s.key} style={{
                  padding: "9px 12px", textAlign: "right",
                  color: INK, fontWeight: 500,
                  borderBottom: `1px solid ${STN}`,
                  fontFamily: "Spectral, serif", fontSize: 12,
                }}>
                  {row.fn(engines[s.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {monteCarlo && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16,
            marginBottom: 24, alignItems: "start",
          }}>
            <div style={{
              background: CARD, border: `1px solid ${STN}`, borderRadius: 10,
              padding: "20px 16px", textAlign: "center",
            }}>
              <div style={{
                fontSize: 9, color: DIM, textTransform: "uppercase",
                letterSpacing: "0.07em", marginBottom: 8,
                fontFamily: "Albert Sans, sans-serif",
              }}>Monte Carlo Success Rate</div>
              <div style={{
                fontFamily: "Spectral, serif", fontSize: 40,
                color: monteCarlo.successRate >= 80 ? PIN : monteCarlo.successRate >= 60 ? GOLD : "#9a3922",
                fontWeight: 500, lineHeight: 1.1,
              }}>
                {monteCarlo.successRate}%
              </div>
              <div style={{
                fontSize: 9, color: DIM, marginTop: 6,
                fontFamily: "Albert Sans, sans-serif",
              }}>
                {monteCarlo.iterations?.toLocaleString() || 1000} simulations
              </div>
              <div style={{
                fontSize: 8.5, color: DIM, marginTop: 8, lineHeight: 1.5,
                fontFamily: "Albert Sans, sans-serif",
              }}>
                Probability the portfolio funds spending to age {lifeExp} under varied return sequences.
              </div>
            </div>
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: DIM, marginBottom: 8,
                fontFamily: "Albert Sans, sans-serif",
              }}>Projected Balance Range (1,000 Simulations)</div>
              <div style={{
                background: CARD, border: `1.5px solid ${STN}`, borderRadius: 12,
                padding: "12px 12px 8px",
              }}>
                <PdfFanChart fanBands={monteCarlo.fanBands} />
              </div>
            </div>
          </div>

          <div style={{
            background: PAP, borderRadius: 10, padding: "12px 16px",
            fontSize: 8.5, color: MID, lineHeight: 1.6,
            fontFamily: "Albert Sans, sans-serif",
          }}>
            Monte Carlo simulation applies random annual return variation (base scenario volatility)
            to 1,000 projected retirement trajectories. Success is defined as the portfolio reaching
            age {lifeExp} without exhausting funds. This is a modelling tool, not a guarantee of
            outcomes. Actual results will vary.
          </div>
        </>
      )}
    </div>
  );
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

function SectionHeader({ label }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: "Spectral, serif", fontSize: 18, color: INK,
        marginBottom: 4, fontWeight: 400,
      }}>{label}</div>
      <div style={{ height: 1.5, width: 40, background: GOLD }} />
    </div>
  );
}

// ─── MAIN REPORT ─────────────────────────────────────────────────────────────

export default function PdfReport({ data, isPremium }) {
  const derived = useMemo(() => {
    try {
      const aT = deriveAssetTotals(data.assetItems);
      const ss = applyMaxedSS({ ...data, ...aT });
      return { ...ss, ...aT };
    } catch { return data; }
  }, [data]);

  const engines = useMemo(() => {
    if (!derived.age || !derived.grossIncome) return null;
    try {
      const base = runEngine(
        { ...derived, activeScenario: "base" },
        { skipMonteCarlo: false, skipAdvancedTax: true }
      );
      if (!isPremium) return { base };
      const cons = runEngine(
        { ...derived, activeScenario: "conservative" },
        { skipMonteCarlo: true, skipAdvancedTax: true }
      );
      const agg = runEngine(
        { ...derived, activeScenario: "aggressive" },
        { skipMonteCarlo: true, skipAdvancedTax: true }
      );
      return { base, conservative: cons, aggressive: agg };
    } catch { return null; }
  }, [derived, isPremium]);

  if (!engines) return null;

  const name = [
    data.firstName,
    data.hasPartner === "yes" && data.partnerName ? `& ${data.partnerName}` : null,
  ].filter(Boolean).join(" ");

  return (
    <div className="pdf-report-root" style={{ display: "none" }}>
      <PageFooter name={name} />
      <CoverPage data={data} />
      <FinancialPositionPage data={derived} engine={engines.base} />
      <RetirementPage data={derived} engine={engines.base} />
      {isPremium && engines.conservative && engines.aggressive && (
        <ScenarioPage
          data={derived}
          engines={engines}
          monteCarlo={engines.base?.monteCarlo}
        />
      )}
    </div>
  );
}
