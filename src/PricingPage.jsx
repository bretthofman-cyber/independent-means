import { useState, useContext } from "react";
import { EntitlementContext } from "./useEntitlement.js";
import { trackCheckoutStarted } from "./analytics.js";

const MONTHLY_LABEL = "A$15";
const ANNUAL_LABEL  = "A$149";
const ANNUAL_PM     = "A$12.42";
const SAVE_PCT      = "17%";

const FREE_FEATURES = [
  "Full 8-stage financial model",
  "Base-case projections",
  "Net worth trajectory chart",
  "FIRE number + Coast FIRE",
  "Basic AU tax modelling",
  "Income, property & super",
  "1 saved plan",
];

const PREMIUM_FEATURES = [
  "Everything in Free",
  "Monte Carlo probability view",
  "Scenario comparison (side by side)",
  "Custom market assumptions",
  "Division 293 tax modelling",
  "Carry-forward concessional cap",
  "Franking credit offsets",
  "Debt recycling strategy",
  "Strategy Centre",
  "PDF export",
  "CSV export (coming soon)",
];

export default function PricingPage({ onClose, user }) {
  const { refreshSubscription } = useContext(EntitlementContext);
  const [selected,    setSelected]    = useState("annual");
  const [checkingOut, setCheckingOut] = useState(false);
  const [apiError,    setApiError]    = useState(null);

  async function startCheckout() {
    if (!user) return;
    setApiError(null);
    setCheckingOut(true);
    trackCheckoutStarted(selected);

    try {
      const { data: { session } } = await import("./supabase.js")
        .then(m => m.supabase.auth.getSession());

      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          planType:   selected,
          successUrl: `${window.location.origin}?checkout=success`,
          cancelUrl:  `${window.location.origin}?checkout=cancelled`,
        }),
      });

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("[pricing-checkout]", err);
      setApiError("Something went wrong. Please try again.");
      setCheckingOut(false);
    }
  }

  const S = {
    overlay: {
      position: "fixed", inset: 0,
      background: "rgba(33,36,30,0.60)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      zIndex: 1300, overflowY: "auto", padding: "40px 20px",
    },
    card: {
      background: "#F5F2EB",
      borderRadius: 24, padding: "44px 40px",
      maxWidth: 560, width: "100%",
      position: "relative",
      boxShadow: "0 24px 80px rgba(33,36,30,0.22)",
    },
    closeBtn: {
      position: "absolute", top: 18, right: 20,
      background: "none", border: "none", fontSize: 18,
      color: "#9DB0A1", cursor: "pointer", lineHeight: 1, padding: 4,
    },
    eyebrow: {
      fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase",
      color: "#C2A06B", fontWeight: 600, marginBottom: 8,
    },
    h1: {
      fontFamily: "Spectral, serif", fontSize: 28, fontWeight: 500,
      color: "#2E4A3D", lineHeight: 1.25, marginBottom: 8,
    },
    subtitle: { fontSize: 14, color: "#6B6655", lineHeight: 1.6, marginBottom: 32 },
    toggleRow: {
      display: "flex", gap: 8, marginBottom: 28,
      background: "#ECE7DB", borderRadius: 12, padding: 4,
    },
    toggleBtn: (active) => ({
      flex: 1, padding: "10px 0", borderRadius: 9,
      border: "none", cursor: "pointer",
      fontSize: 13, fontWeight: 600,
      background: active ? "#2E4A3D" : "transparent",
      color:      active ? "#F5F2EB" : "#6B6655",
      fontFamily: "inherit",
      transition: "background 0.15s, color 0.15s",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }),
    saveBadge: {
      background: "#C2A06B", color: "#FBFAF6",
      fontSize: 10, fontWeight: 700, borderRadius: 6,
      padding: "2px 6px", letterSpacing: "0.04em",
    },
    priceBlock: {
      textAlign: "center", marginBottom: 28,
    },
    price: {
      fontFamily: "Spectral, serif", fontSize: 40, fontWeight: 500,
      color: "#21241E", lineHeight: 1,
    },
    priceSub: { fontSize: 13, color: "#9DB0A1", marginTop: 4 },
    ctaBtn: {
      width: "100%", background: "#2E4A3D", color: "#F5F2EB",
      border: "none", borderRadius: 12, padding: "14px 20px",
      fontSize: 15, fontWeight: 600, cursor: "pointer",
      fontFamily: "inherit", marginBottom: 10,
      transition: "background 0.2s",
    },
    ctaBtnDisabled: {
      width: "100%", background: "#9DB0A1", color: "#F5F2EB",
      border: "none", borderRadius: 12, padding: "14px 20px",
      fontSize: 15, fontWeight: 600, cursor: "default",
      fontFamily: "inherit", marginBottom: 10,
    },
    disclaimer: { fontSize: 11, color: "#9DB0A1", textAlign: "center", lineHeight: 1.5 },
    divider: { borderTop: "1px solid #E8E3D9", margin: "28px 0" },
    featureCols: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" },
    colHead: {
      fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
      color: "#9DB0A1", fontWeight: 600, marginBottom: 12,
    },
    featureItem: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 },
    tick:  { color: "#2E4A3D", fontSize: 13, flexShrink: 0, marginTop: 1 },
    cross: { color: "#D8D2C4", fontSize: 13, flexShrink: 0, marginTop: 1 },
    featureText: { fontSize: 12, color: "#6B6655", lineHeight: 1.45 },
    errorMsg: { fontSize: 12, color: "#B5432A", textAlign: "center", marginBottom: 10 },
  };

  const isAnnual = selected === "annual";

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.card} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose} aria-label="Close">✕</button>

        <div style={S.eyebrow}>Independent Means Premium</div>
        <div style={S.h1}>See your complete financial picture</div>
        <div style={S.subtitle}>
          Monte Carlo analysis, scenario comparison, advanced AU tax modelling,
          and the Strategy Centre, all in one plan.
        </div>

        {/* Monthly / Annual toggle */}
        <div style={S.toggleRow}>
          <button
            style={S.toggleBtn(selected === "monthly")}
            onClick={() => setSelected("monthly")}
          >
            Monthly
          </button>
          <button
            style={S.toggleBtn(selected === "annual")}
            onClick={() => setSelected("annual")}
          >
            Annual
            {selected === "annual" && (
              <span style={S.saveBadge}>Save {SAVE_PCT}</span>
            )}
            {selected !== "annual" && (
              <span style={{ ...S.saveBadge, background: "#9DB0A1" }}>Save {SAVE_PCT}</span>
            )}
          </button>
        </div>

        {/* Price display */}
        <div style={S.priceBlock}>
          <div style={S.price}>
            {isAnnual ? ANNUAL_LABEL : MONTHLY_LABEL}
            <span style={{ fontSize: 18, fontWeight: 400, color: "#9DB0A1" }}>
              {isAnnual ? "/yr" : "/mo"}
            </span>
          </div>
          <div style={S.priceSub}>
            {isAnnual
              ? `${ANNUAL_PM}/mo billed annually, saving A$31 vs monthly`
              : "Billed monthly. Cancel any time."}
          </div>
        </div>

        {/* CTA */}
        {apiError && <div style={S.errorMsg}>{apiError}</div>}
        <button
          style={checkingOut ? S.ctaBtnDisabled : S.ctaBtn}
          onClick={startCheckout}
          disabled={checkingOut}
        >
          {checkingOut ? "Redirecting to checkout…" : `Get ${isAnnual ? "annual" : "monthly"} Premium`}
        </button>
        <div style={S.disclaimer}>
          Secure checkout via Stripe. Cancel or change plan at any time in billing settings.
          General information only. Not personal financial advice.
        </div>

        {/* Feature table */}
        <div style={S.divider} />
        <div style={S.featureCols}>
          <div>
            <div style={S.colHead}>Free</div>
            {FREE_FEATURES.map(f => (
              <div key={f} style={S.featureItem}>
                <span style={S.tick}>✓</span>
                <span style={S.featureText}>{f}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ ...S.colHead, color: "#C2A06B" }}>Premium</div>
            {PREMIUM_FEATURES.map(f => (
              <div key={f} style={S.featureItem}>
                <span style={S.tick}>✓</span>
                <span style={S.featureText}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
