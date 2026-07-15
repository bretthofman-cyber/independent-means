import { useContext, useState } from "react";
import { EntitlementContext } from "./useEntitlement.js";
import TrialModal from "./TrialModal.jsx";

export default function PremiumGate({ featureId, children, label = "Premium feature" }) {
  const { isPremium, status, activateTrial } = useContext(EntitlementContext);
  const [showTrialModal, setShowTrialModal]  = useState(false);
  const [showExpired, setShowExpired]        = useState(false);
  const [unlocking, setUnlocking]            = useState(false);

  if (isPremium) return <>{children}</>;

  async function handleUnlock(e) {
    e.stopPropagation();
    if (status === "free") {
      setUnlocking(true);
      await activateTrial();
      setUnlocking(false);
      setShowTrialModal(true);
    } else {
      setShowExpired(true);
    }
  }

  return (
    <>
      <div style={{ position: "relative", borderRadius: 12 }}>
        {/* Blurred content preview */}
        <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none", opacity: 0.65 }}>
          {children}
        </div>

        {/* Lock overlay */}
        <div
          onClick={handleUnlock}
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(251,250,246,0.80)", borderRadius: 12,
            border: "1.5px solid #ECE7DB", cursor: "pointer",
            minHeight: 80,
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#21241E", marginBottom: 8 }}>{label}</div>
          <div style={{
            fontSize: 12, background: "#2E4A3D", color: "#F5F2EB",
            borderRadius: 20, padding: "5px 16px", fontWeight: 500,
            opacity: unlocking ? 0.6 : 1,
          }}>
            {unlocking ? "Activating…" : status === "free" ? "Start 14-day free trial →" : "Upgrade to unlock →"}
          </div>
        </div>
      </div>

      {showTrialModal && <TrialModal onClose={() => setShowTrialModal(false)} />}

      {showExpired && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(33,36,30,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setShowExpired(false)}
        >
          <div
            style={{
              background: "#FBFAF6", borderRadius: 16, padding: "32px 36px",
              maxWidth: 380, margin: 20, textAlign: "center",
              boxShadow: "0 12px 48px rgba(33,36,30,0.18)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily: "Spectral, serif", fontSize: 20, color: "#21241E", marginBottom: 12 }}>
              Trial ended
            </div>
            <div style={{ fontSize: 14, color: "#6B6655", lineHeight: 1.6, marginBottom: 20 }}>
              Your 14-day trial has ended. Upgrade to Independent Means Premium to keep accessing all features.
            </div>
            <div style={{ fontSize: 12, color: "#9DB0A1", marginBottom: 20 }}>Pricing and upgrade coming soon.</div>
            <button
              onClick={() => setShowExpired(false)}
              style={{
                fontSize: 13, color: "#6B6655", background: "none",
                border: "1px solid #D8D2C4", borderRadius: 8,
                padding: "8px 20px", cursor: "pointer", fontFamily: "inherit",
              }}
            >Close</button>
          </div>
        </div>
      )}
    </>
  );
}
