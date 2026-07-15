export default function TrialBanner({ isTrial, trialDaysLeft }) {
  if (!isTrial) return null;
  const urgent = trialDaysLeft <= 3;
  return (
    <div style={{
      background: urgent ? "#7A3B28" : "#2E4A3D",
      color: "#F5F2EB",
      padding: "7px 28px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 12, lineHeight: 1,
    }}>
      <span>
        {trialDaysLeft === 0
          ? "Your trial expires today"
          : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial — all premium features unlocked`}
      </span>
      <span style={{ color: "#C2A06B", fontSize: 11, flexShrink: 0, marginLeft: 16 }}>
        Upgrade coming soon
      </span>
    </div>
  );
}
