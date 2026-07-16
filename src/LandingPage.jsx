import { useState } from "react";
import { supabase } from "./supabase.js";

// ─── LEGAL MODALS ─────────────────────────────────────────────────────────────

const TERMS_CONTENT = `Last updated: 8 July 2026

PLEASE READ THESE TERMS CAREFULLY BEFORE USING INDEPENDENT MEANS.

1. ACCEPTANCE
By creating an account or using Independent Means ("the Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.

2. NATURE OF THE SERVICE
Independent Means is a financial modelling and educational planning tool. It provides general information only. Nothing on this Service constitutes personal financial advice, investment advice, taxation advice, or any other form of financial product advice as defined under the Corporations Act 2001 (Cth) or the Australian Securities and Investments Commission Act 2001 (Cth).

All projections, estimates, and outputs are illustrative scenario models based on the inputs you provide and stated assumptions. They are not predictions and may differ materially from actual outcomes.

Before making any financial decisions, you should seek advice from a licensed Australian financial adviser (AFSL holder) and, where appropriate, a registered tax agent.

3. ELIGIBILITY
You must be at least 18 years of age and an Australian resident to use the Service. By using the Service, you confirm you meet these requirements.

4. YOUR ACCOUNT
You are responsible for maintaining the confidentiality of your account. You must notify us immediately of any unauthorised use. We reserve the right to suspend or terminate accounts that breach these Terms.

5. ACCEPTABLE USE
You agree not to: misuse the Service for any unlawful purpose; attempt to gain unauthorised access to any part of the Service; reproduce or commercially exploit the Service without written permission; or enter false or misleading information.

6. INTELLECTUAL PROPERTY
All content, software, and design elements of the Service are owned by or licensed to Independent Means. No part of the Service may be reproduced without express written permission.

7. DISCLAIMER OF WARRANTIES
The Service is provided "as is" without warranties of any kind. We do not warrant that the Service will be uninterrupted, error-free, or that outputs will be accurate or suitable for your circumstances.

8. LIMITATION OF LIABILITY
To the maximum extent permitted by Australian law, Independent Means and its operators are not liable for any loss or damage (including consequential, indirect, or economic loss) arising from your use of the Service or reliance on any output it produces.

Nothing in these Terms limits rights you may have under the Australian Consumer Law.

9. PRIVACY
Your use of the Service is also governed by our Privacy Policy, which forms part of these Terms.

10. CHANGES TO TERMS
We may update these Terms from time to time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.

11. GOVERNING LAW
These Terms are governed by the laws of Victoria, Australia. Any disputes will be subject to the exclusive jurisdiction of the courts of Victoria.

12. CONTACT
For questions about these Terms, contact: hello@independentmeans.com.au`;

const PRIVACY_CONTENT = `Last updated: 8 July 2026

Independent Means ("we", "us", "our") is committed to protecting your privacy in accordance with the Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).

1. WHAT INFORMATION WE COLLECT
We collect:
• Account information: your name and email address provided via Google Sign-In.
• Financial planning inputs: the data you enter into the modelling tool (income, assets, super balances, property values, spending targets, etc.).
• Usage data: basic information about how you interact with the Service (e.g. which stages you have completed).

We do not collect payment card details, tax file numbers, or government-issued identity documents.

2. HOW WE USE YOUR INFORMATION
We use your information to:
• Provide and maintain the Service and save your plan across sessions.
• Improve the Service based on how it is used.
• Communicate with you about the Service (e.g. important updates).

We do not use your financial data inputs to provide personalised financial advice.

3. HOW WE STORE YOUR INFORMATION
Your data is stored securely using Supabase (supabase.com), which uses Amazon Web Services (AWS) infrastructure. Data is encrypted at rest and in transit. Row-level security ensures that only you can access your plan data.

4. DISCLOSURE TO THIRD PARTIES
We do not sell, rent, or trade your personal information to third parties. We may disclose information:
• To service providers (Supabase, Vercel, Google) who assist in operating the Service, under confidentiality obligations.
• If required by law or to protect our legal rights.

5. ACCESS AND CORRECTION
You may request access to, or correction of, your personal information at any time by contacting us. You may also delete your account and all associated data directly within the Service ("Clear data" in the app header).

6. COOKIES AND TRACKING
The Service uses session tokens (via Supabase Auth) to keep you signed in. We do not use third-party advertising cookies or tracking pixels.

7. CHILDREN'S PRIVACY
The Service is not directed at persons under 18. We do not knowingly collect information from minors.

8. CHANGES TO THIS POLICY
We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy in the Service.

9. COMPLAINTS
If you have a privacy concern, contact us at hello@independentmeans.com.au. If your concern is not resolved, you may contact the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.

10. CONTACT
Independent Means
Email: hello@independentmeans.com.au`;

function LegalModal({ title, content, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(33,36,30,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#FBFAF6", borderRadius: 14, maxWidth: 640, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #ECE7DB", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 18, color: "#21241E" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8A8270", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", fontSize: 12, color: "#6B6655", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
          {content}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #ECE7DB", flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: "100%", padding: "10px", background: "#2E4A3D", color: "white", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function GoogleButton({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: "13px 28px", background: loading ? "#9DB0A1" : "#2E4A3D",
      color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 500,
      cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", gap: 10,
    }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" fillOpacity=".8"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".7"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".6"/>
      </svg>
      {loading ? "Redirecting…" : "Get started free"}
    </button>
  );
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState(null);

  async function signInWithGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  const W = { maxWidth: 960, margin: "0 auto", padding: "0 24px" };

  return (
    <div style={{ background: "#F5F2EB", fontFamily: "Albert Sans, sans-serif", color: "#21241E" }}>
      {modal === "terms"   && <LegalModal title="Terms of Service" content={TERMS_CONTENT}  onClose={() => setModal(null)} />}
      {modal === "privacy" && <LegalModal title="Privacy Policy"   content={PRIVACY_CONTENT} onClose={() => setModal(null)} />}

      {/* NAV */}
      <nav style={{ background: "#F5F2EB", borderBottom: "1px solid #E8E3D9", padding: "0 24px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ ...W, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 20, color: "#21241E" }}>
            Independent<span style={{ color: "#2E4A3D" }}> Means</span>
          </div>
          <button onClick={signInWithGoogle} disabled={loading} style={{
            fontSize: 13, fontWeight: 500, color: "#2E4A3D", background: "none",
            border: "1.5px solid #2E4A3D", borderRadius: 8, padding: "7px 16px",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {loading ? "Redirecting…" : "Sign in"}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "80px 24px 72px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2E4A3D", background: "#2E4A3D18", borderRadius: 20, padding: "5px 14px", marginBottom: 28 }}>
            Australian Financial Modelling
          </div>
          <h1 style={{ fontFamily: "Spectral, serif", fontSize: "clamp(36px, 6vw, 58px)", fontWeight: 400, lineHeight: 1.15, color: "#21241E", margin: "0 0 24px" }}>
            Know your<br /><span style={{ color: "#2E4A3D" }}>retirement number.</span>
          </h1>
          <p style={{ fontSize: 18, color: "#6B6655", lineHeight: 1.65, margin: "0 0 40px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Project your super, model your net worth, and see the probability your money lasts as long as you do, built specifically for Australian households.
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <GoogleButton onClick={signInWithGoogle} loading={loading} />
            <div style={{ fontSize: 12, color: "#9DB0A1" }}>Free to use · No credit card required</div>
          </div>
        </div>
      </section>

      {/* OUTCOMES */}
      <section style={{ padding: "0 24px 80px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {[
            { icon: "📈", title: "Super projection", body: "See your super balance at retirement across three market scenarios (base, conservative, and aggressive) with contributions tax modelled at 15%." },
            { icon: "💰", title: "Net worth trajectory", body: "Year-by-year net worth from today to life expectancy, combining super, property, savings, and investments in one view." },
            { icon: "🎯", title: "Retirement probability", body: "Monte Carlo simulation across 1,000 scenarios gives you a probability your money lasts to your assumed life expectancy, not just a point estimate." },
            { icon: "🏠", title: "Property & debt", body: "Model multiple investment properties, negative gearing, P&I vs IO loans, and debt-free projections alongside your retirement picture." },
            { icon: "📋", title: "Tax position", body: "Household tax estimated with LITO, Medicare Levy, MLS, HECS, Division 293, franking credits, and salary sacrifice, updated for FY2026-27." },
            { icon: "📄", title: "Action plan", body: "A categorised summary of your key modelling insights across retirement, super, tax, property, and cashflow, built from your numbers, not generic advice." },
          ].map(f => (
            <div key={f.title} style={{ background: "#FBFAF6", border: "1px solid #E8E3D9", borderRadius: 14, padding: "28px 24px" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#21241E", marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: "#FBFAF6", borderTop: "1px solid #E8E3D9", borderBottom: "1px solid #E8E3D9", padding: "72px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: "Spectral, serif", fontSize: 32, fontWeight: 400, color: "#21241E", marginBottom: 12 }}>How it works</div>
            <div style={{ fontSize: 15, color: "#6B6655" }}>Six stages. About 15 minutes. A complete picture of your financial life.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { n: "1", title: "Household profile", body: "Age, partner details, employment, retirement age, life expectancy." },
              { n: "2", title: "Income & budget", body: "Gross income, salary sacrifice, irregular income, and monthly budget by category." },
              { n: "3", title: "Assets & savings", body: "Cash, ETFs, managed funds, crypto, and other investments." },
              { n: "4", title: "Property & debt", body: "PPOR, investment properties, mortgages, HECS, and consumer debt." },
              { n: "5", title: "Superannuation", body: "Super balances, SG rate, contributions, and target retirement spending." },
              { n: "6", title: "Analysis & action plan", body: "Full retirement modelling, net worth chart, Monte Carlo simulation, warnings, and action plan." },
            ].map((s, i, arr) => (
              <div key={s.n} style={{ display: "flex", gap: 20, paddingBottom: i < arr.length - 1 ? 28 : 0 }}>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2E4A3D", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{s.n}</div>
                  {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: "#D8D2C4", margin: "6px 0" }} />}
                </div>
                <div style={{ paddingTop: 6, paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#21241E", marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.6 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {[
            { title: "Deterministic, not AI-estimated", body: "Every projection is calculated by a rules-based engine using your actual inputs, not estimated by an AI. The maths is yours to interrogate." },
            { title: "Australian tax law, FY2026-27", body: "Concessional caps, LITO, Medicare Levy Surcharge, Division 293, HECS, Age Pension means testing, and ABP drawdown rates, all current." },
            { title: "Your data stays yours", body: "All calculations run in your browser. Your data is saved only to your account and never used for advertising, sold, or shared with third parties." },
            { title: "General information only", body: "Independent Means is a modelling tool, not a licensed financial adviser. Every output is a scenario estimate, not a recommendation." },
          ].map(t => (
            <div key={t.title} style={{ borderLeft: "3px solid #2E4A3D", paddingLeft: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#21241E", marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.65 }}>{t.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ background: "#F5F2EB", padding: "72px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "#C2A06B", fontWeight: 600, marginBottom: 8 }}>Pricing</div>
            <div style={{ fontFamily: "Spectral, serif", fontSize: 30, fontWeight: 400, color: "#21241E", lineHeight: 1.25, marginBottom: 12 }}>Simple, transparent pricing</div>
            <div style={{ fontSize: 14, color: "#6B6655", lineHeight: 1.6 }}>Start free. Upgrade when you want the full picture.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 680, margin: "0 auto" }}>
            {/* Free */}
            <div style={{ background: "#FBFAF6", borderRadius: 20, padding: "32px 28px", border: "1px solid #E8E3D9" }}>
              <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9DB0A1", fontWeight: 600, marginBottom: 12 }}>Free</div>
              <div style={{ fontFamily: "Spectral, serif", fontSize: 34, fontWeight: 400, color: "#21241E", lineHeight: 1 }}>A$0</div>
              <div style={{ fontSize: 12, color: "#9DB0A1", marginTop: 4, marginBottom: 24 }}>Forever free</div>
              <button onClick={signInWithGoogle} disabled={loading} style={{
                width: "100%", padding: "11px 0", background: "transparent",
                border: "1.5px solid #D8D2C4", borderRadius: 10, fontSize: 13,
                fontWeight: 600, color: "#2E4A3D", cursor: "pointer", fontFamily: "inherit", marginBottom: 24,
              }}>
                {loading ? "Redirecting…" : "Get started free"}
              </button>
              {["Full 8-stage financial model", "Base-case projections", "Net worth trajectory", "FIRE number + Coast FIRE", "Basic AU tax modelling", "1 saved model"].map(f => (
                <div key={f} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: "#9DB0A1", fontSize: 13 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#6B6655" }}>{f}</span>
                </div>
              ))}
            </div>
            {/* Premium */}
            <div style={{ background: "#2E4A3D", borderRadius: 20, padding: "32px 28px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 14, right: 14, background: "#C2A06B", color: "#FBFAF6", fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "3px 8px", letterSpacing: "0.04em" }}>RECOMMENDED</div>
              <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9DB0A1", fontWeight: 600, marginBottom: 12 }}>Premium</div>
              <div style={{ fontFamily: "Spectral, serif", fontSize: 34, fontWeight: 400, color: "#F5F2EB", lineHeight: 1 }}>A$149
                <span style={{ fontSize: 16, fontWeight: 400, color: "#9DB0A1" }}>/yr</span>
              </div>
              <div style={{ fontSize: 12, color: "#9DB0A1", marginTop: 4, marginBottom: 24 }}>
                A$12.42/mo · or A$15/mo monthly · <span style={{ color: "#C2A06B", fontWeight: 600 }}>Save 17%</span>
              </div>
              <button onClick={signInWithGoogle} disabled={loading} style={{
                width: "100%", padding: "11px 0", background: "#C2A06B",
                border: "none", borderRadius: 10, fontSize: 13,
                fontWeight: 600, color: "#FBFAF6", cursor: "pointer", fontFamily: "inherit", marginBottom: 24,
              }}>
                {loading ? "Redirecting…" : "Start 14-day free trial"}
              </button>
              {["Everything in Free", "Monte Carlo probability view", "Scenario comparison", "Custom assumptions", "Division 293 modelling", "Carry-forward cap", "Franking credits", "Debt recycling", "Strategy Centre", "PDF + CSV export"].map(f => (
                <div key={f} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: "#C2A06B", fontSize: 13 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#9DB0A1" }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#9DB0A1" }}>
            14-day free trial included with Premium. No credit card required to start. Cancel any time.
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ background: "#2E4A3D", padding: "72px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 34, fontWeight: 400, color: "white", marginBottom: 16, lineHeight: 1.2 }}>
            Ready to see your number?
          </div>
          <div style={{ fontSize: 15, color: "#9DB0A1", marginBottom: 36, lineHeight: 1.6 }}>
            Sign in with Google and start modelling in under a minute. Your plan is saved securely to your account.
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <button onClick={signInWithGoogle} disabled={loading} style={{
              padding: "14px 32px", background: loading ? "#6B8F84" : "#C2A06B",
              color: "white", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" fillOpacity=".8"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".7"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".6"/>
              </svg>
              {loading ? "Redirecting…" : "Get started free"}
            </button>
            <div style={{ fontSize: 12, color: "#6B8F84" }}>No credit card · Your data, your account</div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#21241E", padding: "28px 24px" }}>
        <div style={{ ...W, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 16, color: "#9DB0A1" }}>
            Independent<span style={{ color: "#6B8F84" }}> Means</span>
          </div>
          <div style={{ fontSize: 11, color: "#6B6655", display: "flex", gap: 20, flexWrap: "wrap" }}>
            <button onClick={() => setModal("terms")} style={{ background: "none", border: "none", color: "#6B6655", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }}>Terms of Service</button>
            <button onClick={() => setModal("privacy")} style={{ background: "none", border: "none", color: "#6B6655", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }}>Privacy Policy</button>
            <span>hello@independentmeans.com.au</span>
          </div>
          <div style={{ fontSize: 11, color: "#4A4A42" }}>© {new Date().getFullYear()} Independent Means. General information only.</div>
        </div>
      </footer>
    </div>
  );
}

export default LoginScreen;
