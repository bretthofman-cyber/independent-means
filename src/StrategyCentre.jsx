import { useState, useMemo, useEffect } from "react";
import { runEngine } from "./engine.js";
import { deriveAssetTotals } from "./AssetStage.jsx";
import { runOpportunityDetectors } from "./opportunityEngine.js";
import { currency } from "./ui.jsx";
import { trackStrategyModuleUsed } from "./analytics.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

const pf = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;

function StatCard({ label, base, modified, fmtValue, fmtDelta, lowerIsBetter = false }) {
  const delta = modified != null && base != null ? modified - base : null;
  const improved = delta != null && (lowerIsBetter ? delta < 0 : delta > 0);
  const unchanged = delta === 0;
  return (
    <div style={{
      background: "#FBFAF6", border: "1.5px solid #ECE7DB",
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "Spectral, serif", fontSize: 20, color: "#21241E", marginBottom: 4 }}>
        {modified != null ? fmtValue(modified) : "—"}
      </div>
      {delta != null && !unchanged && (
        <div style={{ fontSize: 12, fontWeight: 600, color: improved ? "#2E4A3D" : "#9a3922" }}>
          {fmtDelta(delta)}
        </div>
      )}
      {base != null && modified != null && unchanged && (
        <div style={{ fontSize: 11, color: "#9DB0A1" }}>same as base</div>
      )}
      {base != null && modified == null && (
        <div style={{ fontSize: 11, color: "#9DB0A1" }}>—</div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, fmtValue, fmtMin, fmtMax, note }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{label}</div>
        <div style={{ fontFamily: "Spectral, serif", fontSize: 17, color: "#2E4A3D", fontWeight: 500 }}>
          {fmtValue(value)}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: "100%", accentColor: "#2E4A3D" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9DB0A1", marginTop: 4 }}>
        <span>{fmtMin ?? fmtValue(min)}</span>
        {note && <span style={{ color: "#C2A06B", fontWeight: 500 }}>{note}</span>}
        <span>{fmtMax ?? fmtValue(max)}</span>
      </div>
    </div>
  );
}

function Disclaimer({ text }) {
  return (
    <div style={{ fontSize: 11, color: "#9DB0A1", lineHeight: 1.55, padding: "8px 12px", background: "#F5F2EB", borderRadius: 8, marginTop: 16 }}>
      {text}
    </div>
  );
}

// ── Salary Sacrifice Module ───────────────────────────────────────────────────

function SalarySacrificeModule({ data, engine }) {
  const gross = pf(data.grossIncome) + pf(data.bonusIncome) + pf(data.otherIncome);
  const sgRate = (pf(data.employerSgRate) || 12) / 100;
  const currentSS = pf(data.salarySacrifice);
  const sgAmount = gross * sgRate;
  const headroom = Math.max(0, 30000 - sgAmount);

  const [annualSS, setAnnualSS] = useState(currentSS);

  const modEngine = useMemo(() => {
    const aT = deriveAssetTotals(data.assetItems);
    return runEngine({ ...data, ...aT, salarySacrifice: String(annualSS) }, { skipMonteCarlo: true });
  }, [data, annualSS]);

  const baseTax = engine.metrics.annualHouseholdTax;
  const modTax  = modEngine.metrics.annualHouseholdTax;

  const fmtCurr = v => currency(Math.round(v));
  const fmtAge  = v => `Age ${Math.round(v)}`;

  return (
    <div>
      <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#2E4A3D", marginBottom: 8 }}>
        Salary sacrifice
      </div>
      <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.6, marginBottom: 20 }}>
        Your employer contributes {currency(Math.round(sgAmount))}/yr via SG. Additional salary sacrifice
        directs pre-tax income to super, reducing taxable income up to the $30,000 concessional cap.
      </div>

      <SliderRow
        label="Annual salary sacrifice"
        value={annualSS}
        min={0}
        max={Math.max(1000, Math.round(headroom / 500) * 500)}
        step={500}
        onChange={setAnnualSS}
        fmtValue={v => `${currency(Math.round(v))}/yr`}
        note={`${currency(Math.round(headroom))} cap headroom`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <StatCard
          label="Super at retirement"
          base={engine.metrics.projectedSuper}
          modified={modEngine.metrics.projectedSuper}
          fmtValue={fmtCurr}
          fmtDelta={d => d > 0 ? `+${fmtCurr(d)} more` : `${fmtCurr(d)}`}
        />
        <StatCard
          label="Annual tax"
          base={baseTax}
          modified={modTax}
          fmtValue={fmtCurr}
          fmtDelta={d => d < 0 ? `${fmtCurr(Math.abs(d))}/yr saved` : `+${fmtCurr(d)}/yr more`}
          lowerIsBetter
        />
        <StatCard
          label="FIRE age"
          base={engine.metrics.projectedFIAge}
          modified={modEngine.metrics.projectedFIAge}
          fmtValue={fmtAge}
          fmtDelta={d => {
            const abs = Math.abs(Math.round(d));
            return d < 0 ? `${abs} yr${abs !== 1 ? "s" : ""} earlier` : `${abs} yr${abs !== 1 ? "s" : ""} later`;
          }}
          lowerIsBetter
        />
      </div>

      <Disclaimer text="General information only. Salary sacrifice arrangements have tax implications that depend on your full circumstances. Consult a licensed Australian financial adviser (AFSL holder) or registered tax agent before adjusting salary packaging." />
    </div>
  );
}

// ── Retirement Age Module ─────────────────────────────────────────────────────

function RetirementAgeModule({ data, engine }) {
  const currentAge = pf(data.age) || 40;
  const currentRetAge = pf(data.retirementAge) || 65;
  const lifeExp = pf(data.lifeExpectancy) || 90;
  const minRetAge = Math.max(currentAge + 2, 55);

  const [retAge, setRetAge] = useState(currentRetAge);

  const modEngine = useMemo(() => {
    const aT = deriveAssetTotals(data.assetItems);
    return runEngine({ ...data, ...aT, retirementAge: String(retAge) }, { skipMonteCarlo: true });
  }, [data, retAge]);

  const baseFunded = engine.metrics.lastsToLifeExpectancy ? lifeExp : (engine.metrics.depletionAge ?? null);
  const modFunded  = modEngine.metrics.lastsToLifeExpectancy ? lifeExp : (modEngine.metrics.depletionAge ?? null);
  const fmtCurr = v => currency(Math.round(v));
  const fmtAge  = v => `Age ${Math.round(v)}`;

  return (
    <div>
      <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#2E4A3D", marginBottom: 8 }}>
        Retirement age
      </div>
      <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.6, marginBottom: 20 }}>
        Each extra working year adds contributions, compounds super growth, and removes one year of drawdown.
        The combined effect grows materially over time.
      </div>

      <SliderRow
        label="Target retirement age"
        value={retAge}
        min={minRetAge}
        max={75}
        step={1}
        onChange={v => setRetAge(Math.round(v))}
        fmtValue={v => `Age ${Math.round(v)}`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <StatCard
          label="Super at retirement"
          base={engine.metrics.projectedSuper}
          modified={modEngine.metrics.projectedSuper}
          fmtValue={fmtCurr}
          fmtDelta={d => d > 0 ? `+${fmtCurr(d)} more` : `${fmtCurr(d)}`}
        />
        <StatCard
          label="Funded to age"
          base={baseFunded}
          modified={modFunded}
          fmtValue={fmtAge}
          fmtDelta={d => {
            const abs = Math.abs(Math.round(d));
            return d > 0 ? `+${abs} yr${abs !== 1 ? "s" : ""} longer` : `${abs} yr${abs !== 1 ? "s" : ""} shorter`;
          }}
        />
        <StatCard
          label="FIRE age"
          base={engine.metrics.projectedFIAge}
          modified={modEngine.metrics.projectedFIAge}
          fmtValue={fmtAge}
          fmtDelta={d => {
            const abs = Math.abs(Math.round(d));
            return d < 0 ? `${abs} yr${abs !== 1 ? "s" : ""} earlier` : `${abs} yr${abs !== 1 ? "s" : ""} later`;
          }}
          lowerIsBetter
        />
      </div>

      <Disclaimer text="General information only. Retirement age projections are scenario estimates based on inputs entered. Actual outcomes depend on many factors including investment returns, legislation changes, and health. Discuss any retirement planning decisions with a licensed adviser." />
    </div>
  );
}

// ── Extra Mortgage Repayments Module ─────────────────────────────────────────

function ExtraMortgageModule({ data, engine }) {
  const balance = pf(data.mortgageBalance);
  const rate = pf(data.mortgageRate);
  const monthlyRate = rate / 100 / 12;
  const baseMortgage = engine.mortgage;
  const baseMonthly = baseMortgage?.monthlyPayment ?? 0;
  const baseDFY = baseMortgage?.debtFreeYear ?? 0;

  const [extraMonthly, setExtraMonthly] = useState(0);

  const modResult = useMemo(() => {
    if (!balance || !rate || !baseMonthly) return null;
    const totalMonthly = baseMonthly + extraMonthly;
    let bal = balance;
    let months = 0;
    while (bal > 1 && months < 360 * 2) {
      bal = bal * (1 + monthlyRate) - totalMonthly;
      months++;
    }
    const year = new Date().getFullYear() + Math.ceil(Math.max(0, months) / 12);
    const yearsSaved = baseDFY ? Math.max(0, baseDFY - year) : 0;
    const interestSaved = extraMonthly * months * 0; // placeholder — see below
    return { debtFreeYear: year, yearsSaved, monthsSaved: Math.max(0, baseDFY ? (baseDFY - year) * 12 : 0) };
  }, [balance, rate, monthlyRate, baseMonthly, extraMonthly, baseDFY]);

  const fmtCurr = v => currency(Math.round(v));

  return (
    <div>
      <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#2E4A3D", marginBottom: 8 }}>
        Extra mortgage repayments
      </div>
      <div style={{ fontSize: 13, color: "#6B6655", lineHeight: 1.6, marginBottom: 20 }}>
        Every dollar of extra principal reduces the interest-accruing balance. The compounding effect
        accelerates as the remaining term shortens.
      </div>

      {!balance ? (
        <div style={{ color: "#8A8270", fontSize: 13, padding: "20px 0" }}>No mortgage recorded. Enter your PPOR mortgage in Stage 4 to use this module.</div>
      ) : (
        <>
          <SliderRow
            label="Extra monthly repayment"
            value={extraMonthly}
            min={0}
            max={5000}
            step={100}
            onChange={setExtraMonthly}
            fmtValue={v => `${fmtCurr(v)}/mo`}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <StatCard
              label="Debt free year"
              base={baseDFY}
              modified={modResult?.debtFreeYear}
              fmtValue={v => `${Math.round(v)}`}
              fmtDelta={d => {
                const abs = Math.abs(Math.round(d));
                return d < 0 ? `${abs} yr${abs !== 1 ? "s" : ""} earlier` : `${abs} yr later`;
              }}
              lowerIsBetter
            />
            <StatCard
              label="Total monthly payment"
              base={baseMonthly}
              modified={extraMonthly > 0 ? baseMonthly + extraMonthly : baseMonthly}
              fmtValue={v => `${fmtCurr(v)}/mo`}
              fmtDelta={d => d > 0 ? `+${fmtCurr(d)} extra` : ""}
            />
            <StatCard
              label="Years saved"
              base={null}
              modified={modResult?.yearsSaved ?? 0}
              fmtValue={v => v > 0 ? `${Math.round(v)} yr${Math.round(v) !== 1 ? "s" : ""}` : "None yet"}
              fmtDelta={() => ""}
            />
          </div>

          <Disclaimer text="General information only. Mortgage modelling is illustrative based on current balance and rate inputs. Actual results may differ due to rate changes, redraws, and loan features. Confirm extra repayment rules with your lender before acting." />
        </>
      )}
    </div>
  );
}

// ── Main StrategyCentre modal ─────────────────────────────────────────────────

const MODULES = {
  salary_sacrifice:    SalarySacrificeModule,
  retirement_age:      RetirementAgeModule,
  mortgage_acceleration: ExtraMortgageModule,
};

export default function StrategyCentre({ data, engine, onClose }) {
  const aT = deriveAssetTotals(data.assetItems);
  const enrichedData = { ...data, ...aT };

  const opportunities = runOpportunityDetectors(enrichedData, engine);
  const available = opportunities.filter(o => o.matched && MODULES[o.id]);
  const [activeId, setActiveId] = useState(available[0]?.id ?? null);

  useEffect(() => {
    if (activeId) trackStrategyModuleUsed(activeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const ActiveModule = activeId ? MODULES[activeId] : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(33,36,30,0.55)",
        display: "flex", flexDirection: "column",
        zIndex: 1300,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#F5F2EB",
          borderRadius: "20px 20px 0 0",
          marginTop: "auto",
          height: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 -20px 60px rgba(33,36,30,0.22)",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#2E4A3D", marginBottom: 2 }}>
              Strategy Centre
            </div>
            <div style={{ fontSize: 12, color: "#8A8270" }}>
              Move sliders to model each opportunity using your numbers
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: 20,
              color: "#9DB0A1", cursor: "pointer", padding: "2px 4px", marginTop: 2,
            }}
          >✕</button>
        </div>

        {/* Tab bar */}
        {available.length > 1 && (
          <div style={{
            display: "flex", gap: 0, padding: "14px 24px 0",
            borderBottom: "1px solid #D8D2C4",
            flexShrink: 0, overflowX: "auto",
          }}>
            {available.map(opp => (
              <button
                key={opp.id}
                onClick={() => setActiveId(opp.id)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: `2px solid ${activeId === opp.id ? "#2E4A3D" : "transparent"}`,
                  background: "none",
                  fontSize: 13,
                  fontWeight: activeId === opp.id ? 600 : 400,
                  color: activeId === opp.id ? "#2E4A3D" : "#6B6655",
                  cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {opp.title}
              </button>
            ))}
          </div>
        )}

        {/* Module content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {ActiveModule ? (
            <ActiveModule data={enrichedData} engine={engine} />
          ) : (
            <div style={{ textAlign: "center", color: "#8A8270", paddingTop: 48, fontSize: 14 }}>
              {available.length === 0
                ? "No interactive strategy modules matched your current plan inputs."
                : "Select a strategy above."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
