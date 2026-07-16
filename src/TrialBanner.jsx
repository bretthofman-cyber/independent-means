import { trackGateClick } from "./analytics.js";

export default function TrialBanner({ isTrial, trialDaysLeft, onOpenPricing }) {
  if (!isTrial) return null;

  const urgent = trialDaysLeft <= 3;

  const daysText = trialDaysLeft === 0
    ? "Premium trial: expires today"
    : `Premium trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`;

  return (
    <div style={{
      background:   urgent ? "rgba(194,160,107,0.10)" : "#2E4A3D",
      borderBottom: urgent ? "1px solid rgba(194,160,107,0.30)" : "none",
      color:        urgent ? "#7A5A0E" : "#F5F2EB",
      padding: "7px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 12, lineHeight: 1,
    }}>
      <span style={{ fontWeight: urgent ? 600 : 400 }}>
        {daysText}
      </span>
      <button
        onClick={() => {
          trackGateClick("upgrade_banner", { source: "trial_banner" });
          onOpenPricing?.();
        }}
        style={{
          background: "none", border: "none", padding: 0,
          fontSize: 11, fontWeight: 600,
          color:   urgent ? "#C2A06B" : "rgba(245,242,235,0.70)",
          cursor: "pointer", textDecoration: "underline",
          fontFamily: "inherit", flexShrink: 0, marginLeft: 16,
        }}
      >
        Upgrade
      </button>
    </div>
  );
}
