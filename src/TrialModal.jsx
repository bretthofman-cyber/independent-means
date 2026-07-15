export default function TrialModal({ onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(33,36,30,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FBFAF6", borderRadius: 20, padding: "36px 40px",
          maxWidth: 420, margin: 20, textAlign: "center",
          boxShadow: "0 12px 48px rgba(33,36,30,0.18)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 28, marginBottom: 14, color: "#C2A06B" }}>✦</div>
        <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#21241E", marginBottom: 10 }}>
          Your free trial is now active
        </div>
        <div style={{ fontSize: 14, color: "#6B6655", lineHeight: 1.7, marginBottom: 10 }}>
          All premium features are unlocked for 14 days. No credit card required.
        </div>
        <div style={{ fontSize: 12, color: "#9DB0A1", lineHeight: 1.6, marginBottom: 28 }}>
          Monte Carlo simulation · Scenario comparison · Custom assumptions ·
          Carry-forward cap · Franking credits · Debt recycling · PDF export
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "12px 32px", border: "none", borderRadius: 12,
            background: "#2E4A3D", color: "#F5F2EB", fontSize: 14, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Get started →
        </button>
      </div>
    </div>
  );
}
