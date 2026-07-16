import { useContext, useState, useEffect } from "react";
import { EntitlementContext } from "./useEntitlement.js";
import { runOpportunityDetectors } from "./opportunityEngine.js";
import { trackGateClick, trackOpportunityViewed } from "./analytics.js";
import { FEATURES } from "./features.js";

function OpportunityRow({ opp }) {
  const matched = opp.matched;
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "12px 0",
      borderBottom: "1px solid #ECE7DB",
    }}>
      {/* Indicator */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: matched ? "rgba(194,160,107,0.15)" : "#F5F2EB",
        border: matched ? "1.5px solid #C2A06B" : "1.5px solid #D8D2C4",
        fontSize: 11, fontWeight: 700,
        color: matched ? "#C2A06B" : "#C4BEB4",
      }}>
        {matched ? "✓" : "–"}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: matched ? "#21241E" : "#A09890",
          marginBottom: 3,
        }}>
          {opp.title}
        </div>
        <div style={{
          fontSize: 12, color: matched ? "#6B6655" : "#B0A89E",
          lineHeight: 1.55,
        }}>
          {opp.description}
        </div>
      </div>
    </div>
  );
}

export default function ImprovePlanModal({ data, engine, onClose, onOpenStrategyCentre }) {
  const { can, status, activateTrial } = useContext(EntitlementContext);
  const [activating, setActivating] = useState(false);

  const isPremium = can(FEATURES.STRATEGY_CENTRE);
  const opportunities = runOpportunityDetectors(data, engine);
  const matchCount = opportunities.filter(o => o.matched).length;

  useEffect(() => {
    const matchedIds = opportunities.filter(o => o.matched).map(o => o.id);
    trackOpportunityViewed(matchedIds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartTrial() {
    trackGateClick("improve_my_plan", { source: "improve_modal", action: "start_trial" });
    setActivating(true);
    await activateTrial("improve_my_plan");
    setActivating(false);
    onClose();
  }

  function handleExplorePremium() {
    trackGateClick("improve_my_plan", { source: "improve_modal", action: "see_pricing" });
    // Phase 6: navigate to pricing page
  }

  return (
    <>
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(33,36,30,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1200, padding: "20px 16px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: "#FBFAF6",
            borderRadius: 20,
            width: "100%", maxWidth: 480,
            maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(33,36,30,0.22)",
            overflow: "hidden",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: "28px 32px 20px",
            borderBottom: "1px solid #ECE7DB",
            position: "relative",
          }}>
            <button
              onClick={onClose}
              style={{
                position: "absolute", top: 18, right: 20,
                background: "none", border: "none", fontSize: 18,
                color: "#9DB0A1", cursor: "pointer", padding: 4,
              }}
            >✕</button>

            <div style={{
              fontFamily: "Spectral, serif",
              fontSize: 22, fontWeight: 500,
              color: "#2E4A3D", marginBottom: 6,
            }}>
              Modelling insights
            </div>
            <div style={{ fontSize: 13, color: "#8A8270" }}>
              {matchCount} of {opportunities.length} scenarios identified from your inputs
            </div>
          </div>

          {/* Opportunity list */}
          <div style={{
            overflowY: "auto",
            padding: "0 32px",
            flex: 1,
          }}>
            {opportunities.map(opp => (
              <OpportunityRow key={opp.id} opp={opp} />
            ))}
          </div>

          {/* CTA footer */}
          <div style={{
            padding: "24px 32px",
            borderTop: "1px solid #ECE7DB",
            background: "#FBFAF6",
          }}>
            {!isPremium ? (
              <>
                <div style={{
                  fontSize: 13, color: "#6B6655",
                  lineHeight: 1.6, marginBottom: 16,
                }}>
                  Unlock these scenarios with Independent Means Premium and model each opportunity using your numbers.
                </div>
                <button
                  onClick={status === "free" ? handleStartTrial : handleExplorePremium}
                  disabled={activating}
                  style={{
                    width: "100%",
                    background: activating ? "#9DB0A1" : "#2E4A3D",
                    color: "#F5F2EB",
                    border: "none", borderRadius: 12,
                    padding: "13px 20px",
                    fontSize: 14, fontWeight: 600,
                    cursor: activating ? "default" : "pointer",
                    fontFamily: "inherit",
                    marginBottom: 8,
                  }}
                >
                  {activating ? "Activating…" : status === "free" ? "Start 14-day free trial" : "Upgrade to Premium"}
                </button>
                <button
                  onClick={handleExplorePremium}
                  style={{
                    width: "100%", background: "none",
                    border: "1px solid #D8D2C4", borderRadius: 12,
                    padding: "11px 20px", fontSize: 13,
                    color: "#6B6655", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  See Premium
                </button>
                {status === "free" && (
                  <div style={{
                    marginTop: 12, fontSize: 11,
                    color: "#9DB0A1", textAlign: "center",
                  }}>
                    No credit card required. Trial ends automatically after 14 days.
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 13, color: "#6B6655",
                  lineHeight: 1.6, marginBottom: 16,
                }}>
                  Model each opportunity interactively using your numbers. Move a slider and watch the outcome update in real time.
                </div>
                <button
                  onClick={() => { onClose(); onOpenStrategyCentre?.(); }}
                  style={{
                    width: "100%",
                    background: "#2E4A3D",
                    color: "#F5F2EB",
                    border: "none", borderRadius: 12,
                    padding: "13px 20px",
                    fontSize: 14, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                    marginBottom: 8,
                  }}
                >
                  Open Strategy Centre
                </button>
                <button
                  onClick={onClose}
                  style={{
                    width: "100%", background: "none",
                    border: "1px solid #D8D2C4", borderRadius: 12,
                    padding: "11px 20px", fontSize: 13,
                    color: "#6B6655", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Continue planning
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
