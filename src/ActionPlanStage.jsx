import { useContext } from "react";
import { currency } from "./ui.jsx";
import { generatePlanItems, PLAN_CATEGORIES } from "./actionPlan.js";
import { runEngine } from "./engine.js";
import { deriveAssetTotals } from "./AssetStage.jsx";
import { applyMaxedSS } from "./AnalysisStage.jsx";
import { EntitlementContext } from "./useEntitlement.js";
import PremiumGate from "./PremiumGate.jsx";
import { FEATURES } from "./features.js";
import { exportPlanDataCsv } from "./exportCsv.js";
import { exportBudgetXlsx } from "./exportBudgetXlsx.js";

const PRIORITY_STYLE = {
  1: { border: "#9a3922", bg: "#fdf3f0", dot: "#9a3922", label: "Attention" },
  2: { border: "#8B6914", bg: "#fdf8ed", dot: "#C2A06B", label: "Note"      },
  3: { border: "#D8D2C4", bg: "#FBFAF6", dot: "#9DB0A1", label: "Info"      },
};

function PlanItem({ item }) {
  const s = PRIORITY_STYLE[item.priority] || PRIORITY_STYLE[3];
  return (
    <div style={{ borderLeft: `3px solid ${s.border}`, background: s.bg, borderRadius: "0 8px 8px 0", padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 5 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "#21241E", lineHeight: 1.4 }}>{item.title}</div>
      </div>
      <div style={{ fontSize: 13, color: "#3D3D35", lineHeight: 1.6, marginLeft: 16 }}>{item.body}</div>
      {item.footnote && (
        <div style={{ fontSize: 11, color: "#8A8270", lineHeight: 1.5, marginTop: 6, marginLeft: 16, fontStyle: "italic" }}>{item.footnote}</div>
      )}
    </div>
  );
}

function ActionPlanScreen({ data }) {
  const { can } = useContext(EntitlementContext);
  const aT = deriveAssetTotals(data.assetItems);
  const ssData = applyMaxedSS({ ...data, ...aT });
  const derivedData = { ...ssData, ...aT };
  const engine = runEngine(derivedData, { skipMonteCarlo: !can(FEATURES.PROBABILITY_VIEW), skipAdvancedTax: !can(FEATURES.ADVANCED_TAX) });
  const items = generatePlanItems(derivedData, engine);

  const grouped = Object.keys(PLAN_CATEGORIES).reduce((acc, key) => {
    acc[key] = items.filter(it => it.category === key);
    return acc;
  }, {});

  const m  = engine?.metrics;
  const mc = engine?.monteCarlo;
  const ht = engine?.householdTax;

  const summaryCards = [
    m?.fireNumber       && { label: "FIRE number",          value: currency(m.fireNumber) },
    m?.projectedSuper   && { label: "Projected super",      value: currency(m.projectedSuper) },
    ht?.totalHouseholdTax > 0 && { label: "Est. annual tax", value: currency(ht.totalHouseholdTax) },
    mc?.successRate != null   && { label: "Monte Carlo",     value: mc.successRate + "% success" },
  ].filter(Boolean);

  return (
    <div>
      {summaryCards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 24 }}>
          {summaryCards.map((c, i) => (
            <div key={i} style={{ background: "white", border: "1px solid #ECE7DB", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontFamily: "Spectral, serif", fontSize: 18, color: "#2E4A3D", fontWeight: 500 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#8A8270", lineHeight: 1.6, background: "#F5F2EB", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
        The observations below are derived from your inputs and the modelling engine. They present calculations and factual notes, not personal financial advice. For decisions affecting your financial position, consult a licensed Australian financial adviser (AFSL holder).
      </div>

      {Object.entries(PLAN_CATEGORIES).map(([key, cat]) => {
        const catItems = grouped[key] || [];
        if (catItems.length === 0) return null;
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{cat.icon}</span>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#6B6655" }}>
                {cat.label}
              </div>
            </div>
            {catItems.map(item => <PlanItem key={item.id} item={item} />)}
          </div>
        );
      })}

      <div style={{ marginTop: 8, background: "#F5F2EB", border: "1px solid #ECE7DB", borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6655", marginBottom: 10 }}>
          Topics to explore with a financial adviser
        </div>
        {[
          "Super contribution strategies, including salary sacrifice, carry-forward, and spouse contributions",
          "Insurance: life, income protection, TPD, and trauma cover inside and outside super",
          "Tax-effective investment structuring, including trust structures and ownership allocation",
          "Debt management strategies, including debt recycling where applicable",
          "Estate planning — will, enduring power of attorney, and superannuation death benefit nominations",
          "Age Pension eligibility optimisation and interaction with super drawdown",
        ].map((pt, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ color: "#9DB0A1", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>→</div>
            <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.5 }}>{pt}</div>
          </div>
        ))}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #D8D2C4", fontSize: 11, color: "#8A8270", lineHeight: 1.5 }}>
          These are general topics for educational purposes only. Nothing in this summary constitutes personal financial advice. For tailored advice, engage a licensed Australian financial adviser (AFSL holder).
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PremiumGate featureId={FEATURES.PDF_EXPORT} label="Download PDF report">
          <button onClick={() => window.print()} style={{
            padding: "10px 20px", border: "none", borderRadius: 10,
            background: "#C2A06B", color: "#2A2113", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Download PDF Report</button>
        </PremiumGate>
        <button onClick={() => exportBudgetXlsx(derivedData)} style={{
          padding: "10px 20px", border: "1.5px solid #2E4A3D", borderRadius: 10,
          background: "#2E4A3D", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Download Annual Budget</button>
        <PremiumGate featureId={FEATURES.CSV_EXPORT} label="Download data CSV">
          <button onClick={() => exportPlanDataCsv(derivedData)} style={{
            padding: "10px 20px", border: "1.5px solid #D8D2C4", borderRadius: 10,
            background: "#FBFAF6", color: "#2E4A3D", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>Download Data CSV</button>
        </PremiumGate>
      </div>
    </div>
  );
}

export default ActionPlanScreen;
