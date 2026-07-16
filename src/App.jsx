import { useState, useRef, useEffect } from "react";
import { DEFAULT_SCENARIOS } from "./engine.js";
import { LIFE_EVENT_TYPES, newLifeEvent } from "./lifeEvents.js";
import { currency, Field, Input, Select, Toggle, TwoCol, SectionDivider } from "./ui.jsx";
import Stage2, { BUDGET_CATS } from "./BudgetStage.jsx";
import AssetStage3, { deriveAssetTotals } from "./AssetStage.jsx";
import { supabase } from "./supabase.js";
import { useEntitlement, EntitlementContext } from "./useEntitlement.js";
import PremiumGate from "./PremiumGate.jsx";
import TrialBanner from "./TrialBanner.jsx";
import PricingPage from "./PricingPage.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import { FEATURES } from "./features.js";
import { trackSubscriptionActivated } from "./analytics.js";
import LoginScreen from "./LandingPage.jsx";
import AnalysisScreen from "./AnalysisStage.jsx";
import ActionPlanScreen from "./ActionPlanStage.jsx";

const STAGES = [
  { id: 1, label: "Profile",  icon: "👤", title: "Household Profile",     subtitle: "Let's start with the basics" },
  { id: 2, label: "Income",   icon: "💰", title: "Income & Cashflow",      subtitle: "Your earnings and spending" },
  { id: 3, label: "Assets",   icon: "🏦", title: "Assets & Savings",       subtitle: "What you own and hold" },
  { id: 4, label: "Property", icon: "🏠", title: "Property & Debt",        subtitle: "Leverage and obligations" },
  { id: 5, label: "Super",    icon: "📈", title: "Super & Goals",           subtitle: "Retirement engine and priorities" },
  { id: 6, label: "Analysis", icon: "✦",  title: "Your Financial Picture", subtitle: "Scenario, projections & discussion points" },
  { id: 7, label: "Summary",  icon: "📋", title: "Your Financial Summary", subtitle: "Observations based on your inputs" },
];


const EMPTY_DATA = {
  // Stage 1
  firstName: "", age: "", partnerAge: "", partnerRetirementAge: "", hasPartner: "no",
  partnerName: "",
  dependants: "0", location: "", employmentStatus: "full-time",
  retirementAge: "65", lifeExpectancy: "90", homeOwnership: "owner",
  privateHealthInsurance: "yes", partnerPrivateHealthInsurance: "yes",
  // Stage 2
  grossIncome: "", partnerIncome: "", bonusIncome: "", otherIncome: "",
  partnerBonusIncome: "", partnerOtherIncome: "",
  insuranceAnnualPremium: "",  // legacy — migrated to insurancePremium on load
  monthlyExpenses: "", annualIrregular: "", savingsPerMonth: "",
  budgetItems: [],
  // Stage 3
  assetItems: [],
  emergencyFund: "",
  // Stage 4
  ppOrValue: "", ppOrOwnershipPct: "100",
  mortgageBalance: "", mortgageRate: "", loanType: "pi",
  mortgageStartYear: "", mortgageTenure: "30", mortgageIoExpiryYear: "",
  ppOrOffsetBalance: "",
  hasInvestmentProperty: "no", ipValue: "", ipMortgage: "", ipRate: "",
  ipWeeklyRent: "",
  creditCardDebt: "", personalLoanDebt: "", hecsDebt: "",
  partnerCreditCardDebt: "", partnerPersonalLoanDebt: "", partnerHecsDebt: "",
  // Stage 5
  superBalance: "", partnerSuperBalance: "", employerSgRate: "12",
  partnerEmployerSgRate: "12", salarySacrifice: "", partnerSalarySacrifice: "0",
  salarySacrificeMaxed: false, partnerSalarySacrificeMaxed: false,
  carryForwardCap: "", partnerCarryForwardCap: "",
  frankingCredits: "", partnerFrankingCredits: "",
  insurancePremium: "", insuranceInSuper: "yes",
  partnerInsurancePremium: "", partnerInsuranceInSuper: "yes",
  debtRecycling: false,
  targetRetirementSpending: "",
  // Stage 6
  retirementLifestyle: "comfortable",
  goals: [],
  lifeEvents: [],
  investmentProperties: [],
  riskTolerance: "balanced",
  activeScenario: "base",
  useCustomAssumptions: false,
  customAssumptions: {
    base: { ...DEFAULT_SCENARIOS.base },
    conservative: { ...DEFAULT_SCENARIOS.conservative },
    aggressive: { ...DEFAULT_SCENARIOS.aggressive },
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseData(parsed) {
  try {
    // Migrate legacy single-IP fields to investmentProperties array
    let investmentProperties = parsed.investmentProperties || [];
    if (investmentProperties.length === 0 && parsed.hasInvestmentProperty === "yes" && parsed.ipValue) {
      investmentProperties = [{
        id: "ip_legacy", label: "Investment Property 1", status: "existing",
        purchaseYear: String(new Date().getFullYear()),
        value: parsed.ipValue || "", mortgageBalance: parsed.ipMortgage || "",
        mortgageRate: parsed.ipRate || "", loanType: "pi",
        weeklyRent: parsed.ipWeeklyRent || "", vacancyRate: "4", managementFee: "8",
        councilRates: "", insurance: "", bodyCorpAdmin: "", bodyCorpCapital: "",
        maintenance: "", depreciation: "",
      }];
    }
    // Migrate legacy budget flat object to budgetItems array
    let budgetItems = parsed.budgetItems || [];
    if (budgetItems.length === 0 && parsed.budget) {
      BUDGET_CATS.forEach(cat => {
        const val = parseFloat(String(parsed.budget[cat.key] || "").replace(/,/g, "")) || 0;
        if (val > 0) {
          budgetItems.push({
            id: `migrated_${cat.key}`,
            categoryKey: cat.key,
            label: cat.label,
            amount: String(val),
            frequency: "monthly",
            month: null,
          });
        }
      });
    }

    // Migrate legacy flat asset fields to assetItems array
    let assetItems = parsed.assetItems || [];
    if (assetItems.length === 0) {
      const migrateAsset = (key, label, catKey) => {
        const val = parseFloat(String(parsed[key] || "").replace(/,/g, "")) || 0;
        if (val > 0) assetItems.push({ id: `migrated_${key}`, categoryKey: catKey, label, amount: String(val) });
      };
      migrateAsset("cashSavings",     "Cash savings",          "cash");
      migrateAsset("offsetBalance",   "Offset account",        "cash");
      migrateAsset("sharesEtfs",      "Shares & ETFs",         "shares");
      migrateAsset("managedFunds",    "Managed funds",         "funds");
      migrateAsset("crypto",          "Cryptocurrency",        "crypto");
      migrateAsset("otherInvestments","Other investments",     "other");
    }

    // Migrate legacy string-array goals to object-array goals
    let goals = parsed.goals || [];
    if (goals.length > 0 && typeof goals[0] === "string") {
      goals = goals.map(key => ({ key, label: key, amount: "", frequency: "annual", additive: false }));
    }
    // Remove corrupted goal entries and goals that have been migrated to life events
    const removedGoalKeys = new Set(["payoff-home", "early-retire", "travel", "inheritance", "business", "charity", "education"]);
    goals = goals.filter(g => typeof g.key === "string" && g.key.length > 0 && !removedGoalKeys.has(g.key));

    // Migrate legacy insuranceAnnualPremium (cashflow field) → new insurancePremium / insuranceInSuper
    const insuranceMigration = {};
    if (parsed.insuranceAnnualPremium && !parsed.insurancePremium) {
      insuranceMigration.insurancePremium = parsed.insuranceAnnualPremium;
      insuranceMigration.insuranceInSuper = "no"; // old field was an out-of-pocket cashflow expense
    }

    return {
      ...EMPTY_DATA,
      ...parsed,
      ...insuranceMigration,
      investmentProperties,
      budgetItems,
      assetItems,
      goals,
      customAssumptions: {
        base: { ...DEFAULT_SCENARIOS.base, ...(parsed.customAssumptions?.base || {}) },
        conservative: { ...DEFAULT_SCENARIOS.conservative, ...(parsed.customAssumptions?.conservative || {}) },
        aggressive: { ...DEFAULT_SCENARIOS.aggressive, ...(parsed.customAssumptions?.aggressive || {}) },
      },
    };
  } catch { return { ...EMPTY_DATA }; }
}

function newProperty(label) {
  return {
    id: `ip_${Date.now()}`,
    label: label || "Investment Property",
    status: "existing",
    purchaseYear: String(new Date().getFullYear() + 2),
    value: "", mortgageBalance: "", mortgageRate: "", loanType: "pi", ioExpiryYear: "",
    weeklyRent: "", vacancyRate: "4", managementFee: "8",
    councilRates: "", insurance: "", bodyCorpAdmin: "", bodyCorpCapital: "",
    maintenance: "", depreciation: "",
  };
}

// ─── STAGE FORMS ─────────────────────────────────────────────────────────────

function Stage1({ data, set }) {
  const isNew = !data.firstName && !data.age;
  return (
    <div>
      {isNew && (
        <div style={{
          background: "linear-gradient(135deg, #2E4A3D08 0%, #C2A06B10 100%)",
          border: "1.5px solid #D8D2C4", borderRadius: 12,
          padding: "16px 18px", marginBottom: 24,
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>✦</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#21241E", marginBottom: 4 }}>
              Welcome to Independent Means
            </div>
            <div style={{ fontSize: 12, color: "#6B6655", lineHeight: 1.6 }}>
              A 7-step modelling tool for Australian households. Enter your details to project super, net worth, retirement funding probability, and cashflow, all calculated locally, never sent anywhere.
            </div>
          </div>
        </div>
      )}
      <TwoCol>
        <Field label="First name"><Input value={data.firstName} onChange={v => set("firstName", v)} placeholder="e.g. Alex" /></Field>
        <Field label="Your age"><Input value={data.age} onChange={v => set("age", v)} placeholder="e.g. 34" type="number" /></Field>
      </TwoCol>
      <Field label="Do you have a partner?">
        <Toggle value={data.hasPartner} onChange={v => set("hasPartner", v)}
          options={[{ value: "no", label: "Single" }, { value: "yes", label: "Couple" }]} />
      </Field>
      {data.hasPartner === "yes" && (
        <TwoCol>
          <Field label="Partner's first name"><Input value={data.partnerName} onChange={v => set("partnerName", v)} placeholder="e.g. Sam" /></Field>
          <Field label="Partner's age"><Input value={data.partnerAge} onChange={v => set("partnerAge", v)} placeholder="e.g. 32" type="number" /></Field>
        </TwoCol>
      )}
      <TwoCol>
        <Field label="Dependants">
          <Select value={data.dependants} onChange={v => set("dependants", v)}
            options={["0","1","2","3","4","5+"].map(v => ({ value: v, label: v === "0" ? "None" : v }))} />
        </Field>
        <Field label="Location">
          <Select value={data.location} onChange={v => set("location", v)}
            options={[{ value: "", label: "Select state…" }, ...["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"].map(s => ({ value: s, label: s }))]} />
        </Field>
      </TwoCol>
      <TwoCol>
        <Field label="Employment status">
          <Select value={data.employmentStatus} onChange={v => set("employmentStatus", v)}
            options={[
              { value: "full-time", label: "Full-time" }, { value: "part-time", label: "Part-time" },
              { value: "self-employed", label: "Self-employed" }, { value: "contractor", label: "Contractor" },
              { value: "not-employed", label: "Not employed" },
            ]} />
        </Field>
        <Field label="Home ownership">
          <Select value={data.homeOwnership} onChange={v => set("homeOwnership", v)}
            options={[{ value: "owner", label: "Own home" }, { value: "mortgage", label: "Mortgage" }, { value: "renting", label: "Renting" }]} />
        </Field>
      </TwoCol>
      <SectionDivider label="Retirement horizon" />
      <TwoCol>
        <Field label={data.hasPartner === "yes" ? "Your target retirement age" : "Target retirement age"}>
          <Input value={data.retirementAge} onChange={v => set("retirementAge", v)} placeholder="65" type="number" />
        </Field>
        {data.hasPartner === "yes" ? (
          <Field label="Partner's target retirement age">
            <Input value={data.partnerRetirementAge} onChange={v => set("partnerRetirementAge", v)} placeholder="63" type="number" />
          </Field>
        ) : <div />}
      </TwoCol>
      <Field label="Life expectancy assumption">
        <Input value={data.lifeExpectancy} onChange={v => set("lifeExpectancy", v)} placeholder="90" type="number" />
      </Field>
    </div>
  );
}


// Stage 3 is now AssetStage3 — imported from AssetStage.jsx

// ─── PROPERTY PORTFOLIO COMPONENTS ──────────────────────────────────────────

function PropertyCard({ ip, onChange, onClone, onRemove, isCouple }) {
  const [expanded, setExpanded] = useState(false);
  const ipVal  = parseFloat(String(ip.value).replace(/,/g, "")) || 0;
  const ipMort = parseFloat(String(ip.mortgageBalance).replace(/,/g, "")) || 0;
  const equity = ipVal - ipMort;

  function upd(field, val) { onChange({ ...ip, [field]: val }); }

  return (
    <div style={{ border: "1.5px solid #D8D2C4", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ padding: "12px 16px", background: "#FBFAF6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
              background: ip.status === "existing" ? "#EAF0EC" : "#eaf0f7",
              color: ip.status === "existing" ? "#2E4A3D" : "#3a5a8a",
            }}>
              {ip.status === "existing" ? "Existing" : `Planned ${ip.purchaseYear}`}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#21241E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ip.label}</span>
          </div>
          {(ip.value || ip.weeklyRent) && (
            <div style={{ fontSize: 12, color: "#8A8270", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {ip.value      && <span>Value {currency(ip.value)}</span>}
              {ipMort > 0    && <span>Equity {currency(equity)}</span>}
              {ip.weeklyRent && <span>${ip.weeklyRent}/wk</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onClone} style={{ fontSize: 11, color: "#6B6655", background: "none", border: "1px solid #D8D2C4", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Clone</button>
          <button onClick={onRemove} style={{ fontSize: 11, color: "#9a3922", background: "none", border: "1px solid #f0d0c4", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, color: "#2E4A3D", background: "#EAF0EC", border: "1px solid #D8D2C4", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {expanded ? "Collapse ▲" : "Edit ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "20px 16px", background: "white", borderTop: "1px solid #ECE7DB" }}>
          <TwoCol>
            <Field label="Property label">
              <Input value={ip.label} onChange={v => upd("label", v)} placeholder="e.g. Sydney IP" />
            </Field>
            <Field label="Status">
              <Toggle value={ip.status} onChange={v => upd("status", v)}
                options={[{ value: "existing", label: "Existing" }, { value: "planned", label: "Planned" }]} />
            </Field>
          </TwoCol>
          {ip.status === "planned" && (
            <Field label="Target purchase year">
              <Input value={ip.purchaseYear} onChange={v => upd("purchaseYear", v)} placeholder="2028" type="number" />
            </Field>
          )}
          <SectionDivider label="Property details" />
          <TwoCol>
            <Field label="Estimated value"><Input value={ip.value} onChange={v => upd("value", v)} placeholder="750,000" prefix="$" /></Field>
            {isCouple ? (
              <Field label="Your ownership share" hint="% you own">
                <Input value={ip.ownershipPct ?? "50"} onChange={v => upd("ownershipPct", v)} placeholder="50" suffix="%" />
              </Field>
            ) : <Field label="Mortgage balance"><Input value={ip.mortgageBalance} onChange={v => upd("mortgageBalance", v)} placeholder="450,000" prefix="$" /></Field>}
          </TwoCol>
          {isCouple && (
            <Field label="Mortgage balance"><Input value={ip.mortgageBalance} onChange={v => upd("mortgageBalance", v)} placeholder="450,000" prefix="$" /></Field>
          )}
          <TwoCol>
            <Field label="Interest rate"><Input value={ip.mortgageRate} onChange={v => upd("mortgageRate", v)} placeholder="6.5" suffix="%" /></Field>
            <Field label="Loan type">
              <Select value={ip.loanType} onChange={v => upd("loanType", v)}
                options={[{ value: "pi", label: "Principal & Interest" }, { value: "io", label: "Interest Only" }]} />
            </Field>
          </TwoCol>
          {ip.loanType === "io" && (() => {
            const expiryYear = parseInt(ip.ioExpiryYear);
            const ipStartYear = parseInt(ip.purchaseYear) || new Date().getFullYear();
            const ipTenure = 30;
            const endYear = ipStartYear + ipTenure;
            const showInfo = !isNaN(expiryYear) && expiryYear > 0 && !isNaN(endYear) && endYear > expiryYear;
            return (
              <>
                <Field label="Interest only period ends" hint="Year the loan reverts to Principal & Interest">
                  <Input value={ip.ioExpiryYear} onChange={v => upd("ioExpiryYear", v)} placeholder={String(new Date().getFullYear() + 3)} type="number" />
                </Field>
                {showInfo && (
                  <div style={{ fontSize: 12, color: "#5a6e5e", background: "#EAF0EC", border: "1px solid #C8D8CC", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                    Interest only until <strong>{expiryYear}</strong>. Reverts to P&amp;I repayments from {expiryYear} until loan end in <strong>{endYear}</strong>.
                  </div>
                )}
              </>
            );
          })()}
          <SectionDivider label="Rental income" />
          <TwoCol>
            <Field label="Weekly rent"><Input value={ip.weeklyRent} onChange={v => upd("weeklyRent", v)} placeholder="550" prefix="$" /></Field>
            <Field label="Vacancy rate" hint="Default 4%"><Input value={ip.vacancyRate} onChange={v => upd("vacancyRate", v)} placeholder="4" suffix="%" /></Field>
          </TwoCol>
          <Field label="Management fee" hint="% of gross rent (default 8%)">
            <Input value={ip.managementFee} onChange={v => upd("managementFee", v)} placeholder="8" suffix="%" />
          </Field>
          <SectionDivider label="Annual expenses" />
          <TwoCol>
            <Field label="Council rates"><Input value={ip.councilRates} onChange={v => upd("councilRates", v)} placeholder="2,000" prefix="$" /></Field>
            <Field label="Landlord insurance"><Input value={ip.insurance} onChange={v => upd("insurance", v)} placeholder="1,500" prefix="$" /></Field>
          </TwoCol>
          <TwoCol>
            <Field label="Body corp: admin" hint="Operating fund levy">
              <Input value={ip.bodyCorpAdmin} onChange={v => upd("bodyCorpAdmin", v)} placeholder="0" prefix="$" />
            </Field>
            <Field label="Body corp: capital" hint="Sinking fund levy">
              <Input value={ip.bodyCorpCapital} onChange={v => upd("bodyCorpCapital", v)} placeholder="0" prefix="$" />
            </Field>
          </TwoCol>
          <Field label="Maintenance reserve" hint="Annual allowance for repairs">
            <Input value={ip.maintenance} onChange={v => upd("maintenance", v)} placeholder="1,000" prefix="$" />
          </Field>
          <SectionDivider label="Tax deductions" />
          <Field label="Annual depreciation" hint="Building allowance + plant & equipment. A quantity surveyor can assess this.">
            <Input value={ip.depreciation} onChange={v => upd("depreciation", v)} placeholder="0" prefix="$" />
          </Field>
        </div>
      )}
    </div>
  );
}

function PropertyPortfolio({ ips, onChange, isCouple }) {
  function addProperty() {
    onChange([...ips, newProperty(`Investment Property ${ips.length + 1}`)]);
  }
  function updateAt(i, updated) { onChange(ips.map((ip, idx) => idx === i ? updated : ip)); }
  function cloneAt(i) {
    const clone = { ...ips[i], id: `ip_${Date.now()}`, label: `${ips[i].label} (copy)`, status: "planned" };
    onChange([...ips, clone]);
  }
  function removeAt(i) { onChange(ips.filter((_, idx) => idx !== i)); }

  return (
    <div>
      {ips.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", background: "#FBFAF6", border: "1.5px dashed #D8D2C4", borderRadius: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#8A8270", marginBottom: 12 }}>No investment properties added yet</div>
          <button onClick={addProperty} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#2E4A3D", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            + Add Investment Property
          </button>
        </div>
      ) : (
        <>
          {ips.map((ip, i) => (
            <PropertyCard key={ip.id} ip={ip}
              onChange={updated => updateAt(i, updated)}
              onClone={() => cloneAt(i)}
              onRemove={() => removeAt(i)}
              isCouple={isCouple}
            />
          ))}
          <button onClick={addProperty} style={{ width: "100%", padding: "10px", border: "1.5px dashed #D8D2C4", borderRadius: 10, background: "#FBFAF6", fontSize: 13, color: "#2E4A3D", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            + Add another property
          </button>
        </>
      )}
    </div>
  );
}

function Stage4({ data, set }) {
  const partner = data.partnerName || "Partner";
  const isCouple = data.hasPartner === "yes";
  return (
    <div>
      {(data.homeOwnership === "mortgage" || data.homeOwnership === "owner") && (
        <>
          <TwoCol>
            <Field label="PPOR estimated value"><Input value={data.ppOrValue} onChange={v => set("ppOrValue", v)} placeholder="850,000" prefix="$" /></Field>
            {isCouple ? (
              <Field label="Your ownership share" hint="% you own; the remainder is your partner's">
                <Input value={data.ppOrOwnershipPct} onChange={v => set("ppOrOwnershipPct", v)} placeholder="50" suffix="%" />
              </Field>
            ) : <div />}
          </TwoCol>
          <TwoCol>
            <Field label="Mortgage balance"><Input value={data.mortgageBalance} onChange={v => set("mortgageBalance", v)} placeholder="450,000" prefix="$" /></Field>
            <Field label="Interest rate"><Input value={data.mortgageRate} onChange={v => set("mortgageRate", v)} placeholder="6.2" suffix="%" /></Field>
          </TwoCol>
          <TwoCol>
            <Field label="Loan type">
              <Select value={data.loanType} onChange={v => set("loanType", v)}
                options={[{ value: "pi", label: "Principal & Interest" }, { value: "io", label: "Interest Only" }]} />
            </Field>
            <Field label="Loan tenure" hint="Original term in years">
              <Input value={data.mortgageTenure} onChange={v => set("mortgageTenure", v)} placeholder="30" suffix="yrs" type="number" />
            </Field>
          </TwoCol>
          <Field label="Mortgage start year" hint="Year the loan was taken out; used to calculate remaining term">
            <Input value={data.mortgageStartYear} onChange={v => set("mortgageStartYear", v)} placeholder={String(new Date().getFullYear())} type="number" />
          </Field>
          <Field label="Offset account balance" hint="Reduces effective mortgage interest. Enter your current offset balance">
            <Input value={data.ppOrOffsetBalance} onChange={v => set("ppOrOffsetBalance", v)} placeholder="0" prefix="$" />
          </Field>
          {data.loanType === "io" && (() => {
            const expiryYear = parseInt(data.mortgageIoExpiryYear);
            const endYear = parseInt(data.mortgageStartYear) + parseInt(data.mortgageTenure || "30");
            const showInfo = !isNaN(expiryYear) && expiryYear > 0 && !isNaN(endYear) && endYear > expiryYear;
            return (
              <>
                <Field label="Interest only period ends" hint="Year the loan reverts to Principal & Interest">
                  <Input value={data.mortgageIoExpiryYear} onChange={v => set("mortgageIoExpiryYear", v)} placeholder={String(new Date().getFullYear() + 3)} type="number" />
                </Field>
                {showInfo && (
                  <div style={{ fontSize: 12, color: "#5a6e5e", background: "#EAF0EC", border: "1px solid #C8D8CC", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
                    Interest only until <strong>{expiryYear}</strong>. Reverts to P&amp;I repayments from {expiryYear} until loan end in <strong>{endYear}</strong>.
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}
      {data.homeOwnership === "mortgage" && parseFloat(String(data.mortgageBalance || "").replace(/,/g, "")) > 0 && (
        <>
          <SectionDivider label="Debt recycling" />
          <PremiumGate featureId="debt_recycling" label="Debt recycling">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px", border: "1.5px solid #D8D2C4", borderRadius: 10, background: "#FBFAF6", marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E", marginBottom: 2 }}>Enable debt recycling</div>
                <div style={{ fontSize: 11, color: "#8A8270", lineHeight: 1.5 }}>
                  Converts non-deductible mortgage interest to deductible investment debt as you repay and redraw. Modelled as an annual tax saving added to liquid savings. General information only. Consult a tax adviser before implementing.
                </div>
              </div>
              <button
                onClick={() => set("debtRecycling", !data.debtRecycling)}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                  background: data.debtRecycling ? "#2E4A3D" : "#D8D2C4",
                  position: "relative", flexShrink: 0, marginTop: 2, transition: "background 0.2s",
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", background: "white",
                  position: "absolute", top: 3, left: data.debtRecycling ? 21 : 3, transition: "left 0.2s",
                }} />
              </button>
            </div>
          </PremiumGate>
        </>
      )}
      <SectionDivider label="Investment properties" />
      <PropertyPortfolio
        ips={data.investmentProperties || []}
        onChange={newIPs => set("investmentProperties", newIPs)}
        isCouple={isCouple}
      />
      <SectionDivider label="Other debts" />
      {isCouple ? (
        <>
          <div style={{ fontSize: 11, color: "#8A8270", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Your debts
          </div>
          <TwoCol>
            <Field label="Credit card"><Input value={data.creditCardDebt} onChange={v => set("creditCardDebt", v)} placeholder="0" prefix="$" /></Field>
            <Field label="Personal loans"><Input value={data.personalLoanDebt} onChange={v => set("personalLoanDebt", v)} placeholder="0" prefix="$" /></Field>
          </TwoCol>
          <Field label="HECS / HELP"><Input value={data.hecsDebt} onChange={v => set("hecsDebt", v)} placeholder="0" prefix="$" /></Field>
          <div style={{ fontSize: 11, color: "#8A8270", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, marginTop: 16 }}>
            {partner}'s debts
          </div>
          <TwoCol>
            <Field label="Credit card"><Input value={data.partnerCreditCardDebt} onChange={v => set("partnerCreditCardDebt", v)} placeholder="0" prefix="$" /></Field>
            <Field label="Personal loans"><Input value={data.partnerPersonalLoanDebt} onChange={v => set("partnerPersonalLoanDebt", v)} placeholder="0" prefix="$" /></Field>
          </TwoCol>
          <Field label="HECS / HELP"><Input value={data.partnerHecsDebt} onChange={v => set("partnerHecsDebt", v)} placeholder="0" prefix="$" /></Field>
        </>
      ) : (
        <>
          <TwoCol>
            <Field label="Credit card debt"><Input value={data.creditCardDebt} onChange={v => set("creditCardDebt", v)} placeholder="0" prefix="$" /></Field>
            <Field label="Personal loans"><Input value={data.personalLoanDebt} onChange={v => set("personalLoanDebt", v)} placeholder="0" prefix="$" /></Field>
          </TwoCol>
          <Field label="HECS / HELP debt"><Input value={data.hecsDebt} onChange={v => set("hecsDebt", v)} placeholder="0" prefix="$" /></Field>
        </>
      )}
    </div>
  );
}

// Reusable salary-sacrifice row with max toggle and cap warning
function SalarySacrificeRow({ label, grossIncome, sgRate, ssValue, ssMaxed, onSsChange, onMaxedChange, hint }) {
  const pf = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const gross = pf(grossIncome);
  const sg = gross * ((pf(sgRate) || 12) / 100);
  const capRoom = Math.max(0, 30000 - sg);
  const currentSS = pf(ssValue);
  const effectiveSS = ssMaxed ? Math.round(capRoom) : currentSS;
  const isOverCap = !ssMaxed && currentSS > 0 && currentSS > capRoom;
  const displayVal = ssMaxed ? String(Math.round(capRoom)) : (ssValue || "");

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{label}</div>
          {hint && <div style={{ fontSize: 11, color: "#8A8270", marginTop: 1 }}>{hint}</div>}
        </div>
        {gross > 0 && (
          <button
            onClick={() => onMaxedChange(!ssMaxed)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              border: "1.5px solid", borderColor: ssMaxed ? "#2E4A3D" : "#D8D2C4",
              borderRadius: 20, background: ssMaxed ? "#EAF0EC" : "white",
              cursor: "pointer", fontFamily: "inherit", fontSize: 11,
              color: ssMaxed ? "#2E4A3D" : "#6B6655", flexShrink: 0,
            }}
          >
            <div style={{
              width: 26, height: 15, borderRadius: 8,
              background: ssMaxed ? "#2E4A3D" : "#D8D2C4",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
              <div style={{
                width: 11, height: 11, borderRadius: "50%", background: "white",
                position: "absolute", top: 2, left: ssMaxed ? 13 : 2,
                transition: "left 0.2s",
              }} />
            </div>
            {ssMaxed ? "Maxed to cap" : "Max to cap"}
          </button>
        )}
      </div>
      <Input
        value={displayVal}
        onChange={v => { if (!ssMaxed) onSsChange(v); }}
        placeholder="0"
        prefix="$"
        disabled={ssMaxed}
      />
      {gross > 0 && (
        <div style={{ fontSize: 11, color: isOverCap ? "#9a3922" : "#8A8270", marginTop: 5, lineHeight: 1.5 }}>
          {isOverCap
            ? `Warning: ${currency(currentSS)}/yr exceeds the ${currency(capRoom)}/yr cap room. Excess concessional contributions are taxed at your marginal rate (less a 15% offset).`
            : `SG ${currency(Math.round(sg))}/yr · cap room ${currency(Math.round(capRoom))}/yr · cap $30,000/yr`}
        </div>
      )}
    </div>
  );
}

function Stage5({ data, set }) {
  return (
    <div>
      <TwoCol>
        <Field label="Your super balance"><Input value={data.superBalance} onChange={v => set("superBalance", v)} placeholder="68,000" prefix="$" /></Field>
        {data.hasPartner === "yes" && (
          <Field label={`${data.partnerName || "Partner"}'s super balance`}><Input value={data.partnerSuperBalance} onChange={v => set("partnerSuperBalance", v)} placeholder="55,000" prefix="$" /></Field>
        )}
      </TwoCol>

      <SectionDivider label="Salary sacrifice" />
      <TwoCol>
        <Field label="Your employer SG rate" hint="Currently 12% for most employees">
          <Input value={data.employerSgRate} onChange={v => set("employerSgRate", v)} placeholder="12" suffix="%" />
        </Field>
        {data.hasPartner === "yes" && (
          <Field label={`${data.partnerName || "Partner"}'s SG rate`} hint="Currently 12% for most employees">
            <Input value={data.partnerEmployerSgRate} onChange={v => set("partnerEmployerSgRate", v)} placeholder="12" suffix="%" />
          </Field>
        )}
      </TwoCol>

      <SalarySacrificeRow
        label="Your salary sacrifice (annual)"
        hint="Pre-tax contributions above SG"
        grossIncome={data.grossIncome}
        sgRate={data.employerSgRate}
        ssValue={data.salarySacrifice}
        ssMaxed={!!data.salarySacrificeMaxed}
        onSsChange={v => set("salarySacrifice", v)}
        onMaxedChange={v => set("salarySacrificeMaxed", v)}
      />

      {data.hasPartner === "yes" && (
        <SalarySacrificeRow
          label={`${data.partnerName || "Partner"}'s salary sacrifice (annual)`}
          hint="Pre-tax contributions above SG"
          grossIncome={data.partnerIncome}
          sgRate={data.partnerEmployerSgRate}
          ssValue={data.partnerSalarySacrifice}
          ssMaxed={!!data.partnerSalarySacrificeMaxed}
          onSsChange={v => set("partnerSalarySacrifice", v)}
          onMaxedChange={v => set("partnerSalarySacrificeMaxed", v)}
        />
      )}

      <SectionDivider label="Carry-forward contributions" />
      <div style={{ fontSize: 12, color: "#8A8270", marginBottom: 12, lineHeight: 1.5 }}>
        If your prior-year super balance was under $500,000 and you have unused concessional cap from previous years, you may be able to contribute more than the $30,000 annual cap. Check your available amount via ATO online services.
      </div>
      <PremiumGate featureId="carry_forward_cap" label="Carry-forward contributions">
        <TwoCol>
          <Field label="Your carry-forward cap available" hint="From ATO online services; leave blank if not applicable">
            <Input value={data.carryForwardCap} onChange={v => set("carryForwardCap", v)} placeholder="0" prefix="$" />
          </Field>
          {data.hasPartner === "yes" && (
            <Field label={`${data.partnerName || "Partner"}'s carry-forward cap`} hint="From ATO online services">
              <Input value={data.partnerCarryForwardCap} onChange={v => set("partnerCarryForwardCap", v)} placeholder="0" prefix="$" />
            </Field>
          )}
        </TwoCol>
      </PremiumGate>

      <SectionDivider label="Franking credits" />
      <div style={{ fontSize: 12, color: "#8A8270", marginBottom: 12, lineHeight: 1.5 }}>
        Annual franking credits from Australian shares or managed funds. These offset your income tax; any excess is refunded by the ATO. Check your dividend statements or last year's tax return.
      </div>
      <PremiumGate featureId="franking_credits" label="Franking credits">
        <TwoCol>
          <Field label="Your annual franking credits" hint="From dividends; shown on dividend statements">
            <Input value={data.frankingCredits} onChange={v => set("frankingCredits", v)} placeholder="0" prefix="$" />
          </Field>
          {data.hasPartner === "yes" && (
            <Field label={`${data.partnerName || "Partner"}'s franking credits`}>
              <Input value={data.partnerFrankingCredits} onChange={v => set("partnerFrankingCredits", v)} placeholder="0" prefix="$" />
            </Field>
          )}
        </TwoCol>
      </PremiumGate>

      <SectionDivider label="Life & disability insurance" />
      <div style={{ fontSize: 12, color: "#8A8270", marginBottom: 14, lineHeight: 1.6 }}>
        Insurance held inside super is paid from your fund balance. It reduces super accumulation but doesn't affect take-home pay. Insurance outside super is a direct cashflow cost and also appears in Stage 2, Income &amp; Cashflow.
      </div>
      <Field label="Your annual insurance premium" hint="Total for life/death + TPD covers; check your super fund statement or policy schedule">
        <Input value={data.insurancePremium} onChange={v => set("insurancePremium", v)} placeholder="0" prefix="$" />
      </Field>
      {parseFloat(String(data.insurancePremium || "").replace(/,/g, "")) > 0 && (
        <Field label="Premium location">
          <Toggle value={data.insuranceInSuper} onChange={v => set("insuranceInSuper", v)}
            options={[{ value: "yes", label: "Inside super" }, { value: "no", label: "Outside super (cash)" }]} />
        </Field>
      )}
      {parseFloat(String(data.insurancePremium || "").replace(/,/g, "")) > 0 && data.insuranceInSuper !== "yes" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "#EAF0EC", border: "1px solid #C8D8CC", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#2E4A3D", lineHeight: 1.5 }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>↗</span>
          <span>
            This outside-super premium is synced to <strong>Income &amp; Cashflow (Stage 2)</strong>. It appears there as a cashflow expense. Update it in either place.
          </span>
        </div>
      )}
      {data.hasPartner === "yes" && (
        <>
          <Field label={`${data.partnerName || "Partner"}'s annual insurance premium`} hint="Total for life/death + TPD; from their super fund statement or policy">
            <Input value={data.partnerInsurancePremium} onChange={v => set("partnerInsurancePremium", v)} placeholder="0" prefix="$" />
          </Field>
          {parseFloat(String(data.partnerInsurancePremium || "").replace(/,/g, "")) > 0 && (
            <Field label={`${data.partnerName || "Partner"}'s premium location`}>
              <Toggle value={data.partnerInsuranceInSuper} onChange={v => set("partnerInsuranceInSuper", v)}
                options={[{ value: "yes", label: "Inside super" }, { value: "no", label: "Outside super (cash)" }]} />
            </Field>
          )}
          {parseFloat(String(data.partnerInsurancePremium || "").replace(/,/g, "")) > 0 && data.partnerInsuranceInSuper !== "yes" && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", background: "#EAF0EC", border: "1px solid #C8D8CC", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#2E4A3D", lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>↗</span>
              <span>
                {data.partnerName || "Partner"}'s outside-super premium is synced to <strong>Income &amp; Cashflow (Stage 2)</strong>. Update it in either place.
              </span>
            </div>
          )}
        </>
      )}

      <SectionDivider label="Retirement target & life events" />
      <Field label="Target annual retirement spending" hint="In today's dollars. What lifestyle do you want in retirement?">
        <Input value={data.targetRetirementSpending} onChange={v => set("targetRetirementSpending", v)} placeholder="65,000" prefix="$" />
      </Field>

      <LifeEventsPanel data={data} set={set} />
    </div>
  );
}

// ─── LIFE EVENTS PANEL ────────────────────────────────────────────────────────

function LifeEventsPanel({ data, set }) {
  const [showPicker, setShowPicker] = useState(false);
  const events = data.lifeEvents || [];
  const partner = data.partnerName || "Partner";
  const isCouple = data.hasPartner === "yes";

  function addEvent(type) {
    const evt = newLifeEvent(type);
    set("lifeEvents", [...events, evt]);
    setShowPicker(false);
  }

  function updateEvent(id, field, val) {
    set("lifeEvents", events.map(e => e.id === id ? { ...e, [field]: val } : e));
  }

  function removeEvent(id) {
    set("lifeEvents", events.filter(e => e.id !== id));
  }

  const personOptions = [
    { value: "primary", label: data.firstName || "You" },
    ...(isCouple ? [{ value: "partner", label: partner }, { value: "both", label: "Both" }] : []),
  ];

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionDivider label="Life events & milestones" />
      <div style={{ fontSize: 12, color: "#8A8270", marginBottom: 14 }}>
        Add events that will affect your cashflow, income, or assets at a specific point in time. They are layered on top of your base scenario.
      </div>

      {events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {events.map(evt => {
            const meta = LIFE_EVENT_TYPES[evt.type] || {};
            const needsAmount    = meta.fields?.includes("amount") || false;
            const needsDuration  = meta.fields?.includes("durationYears") || false;
            const needsReduction = meta.fields?.includes("incomeReductionPct") || false;
            const needsPause     = meta.fields?.includes("pauseMonths") || false;
            const needsPerson    = !!meta.personed && isCouple;
            const needsLabel     = meta.fields?.includes("customLabel") || false;
            const needsCostBase  = meta.fields?.includes("costBase") || false;
            const needsHeld12    = meta.fields?.includes("heldOver12Months") || false;

            return (
              <div key={evt.id} style={{ border: "1.5px solid #D8D2C4", borderRadius: 10, overflow: "hidden", background: "#FBFAF6" }}>
                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon || "📅"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{meta.label || evt.type}</div>
                    {evt.customLabel && <div style={{ fontSize: 11, color: "#8A8270" }}>{evt.customLabel}</div>}
                  </div>
                  <button onClick={() => removeEvent(evt.id)} style={{ fontSize: 11, color: "#9a3922", background: "none", border: "1px solid #f0d0c4", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Remove</button>
                </div>

                <div style={{ padding: "0 14px 14px", borderTop: "1px solid #ECE7DB", display: "flex", flexWrap: "wrap", gap: 10, marginTop: 0 }}>
                  <div style={{ paddingTop: 12, display: "contents" }}>
                    <Field label="Year" hint="Calendar year">
                      <Input value={evt.year} onChange={v => updateEvent(evt.id, "year", v)} placeholder="2028" type="number" />
                    </Field>
                    {needsLabel && (
                      <Field label="Description">
                        <Input value={evt.customLabel} onChange={v => updateEvent(evt.id, "customLabel", v)} placeholder="e.g. Home renovation" />
                      </Field>
                    )}
                    {needsPerson && (
                      <Field label="Applies to">
                        <Select value={evt.person} onChange={v => updateEvent(evt.id, "person", v)} options={personOptions} />
                      </Field>
                    )}
                    {needsAmount && (
                      <Field label="Amount">
                        <Input value={evt.amount} onChange={v => updateEvent(evt.id, "amount", v)} prefix="$" placeholder="50,000" />
                      </Field>
                    )}
                    {needsDuration && (
                      <Field label="Duration">
                        <Input value={evt.durationYears} onChange={v => updateEvent(evt.id, "durationYears", v)} suffix="yrs" placeholder="2" type="number" />
                      </Field>
                    )}
                    {needsReduction && (
                      <Field label="Income reduction">
                        <Input value={evt.incomeReductionPct} onChange={v => updateEvent(evt.id, "incomeReductionPct", v)} suffix="%" placeholder="100" type="number" />
                      </Field>
                    )}
                    {needsPause && (
                      <Field label="Income pause">
                        <Input value={evt.pauseMonths} onChange={v => updateEvent(evt.id, "pauseMonths", v)} suffix="mo" placeholder="6" type="number" />
                      </Field>
                    )}
                    {needsCostBase && (
                      <Field label="Cost base" hint="Original purchase price + costs">
                        <Input value={evt.costBase} onChange={v => updateEvent(evt.id, "costBase", v)} prefix="$" placeholder="400,000" />
                      </Field>
                    )}
                    {needsHeld12 && (
                      <Field label="Held over 12 months?" hint="50% CGT discount applies">
                        <Select
                          value={evt.heldOver12Months || "yes"}
                          onChange={v => updateEvent(evt.id, "heldOver12Months", v)}
                          options={[{ value: "yes", label: "Yes (50% discount applies)" }, { value: "no", label: "No (full gain taxable)" }]}
                        />
                      </Field>
                    )}
                  </div>
                </div>
                {meta.hint && (
                  <div style={{ padding: "0 14px 12px", fontSize: 11, color: "#8A8270", lineHeight: 1.5 }}>{meta.hint}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showPicker ? (
        <div style={{ border: "1.5px solid #D8D2C4", borderRadius: 10, overflow: "hidden", background: "white" }}>
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #ECE7DB" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#21241E" }}>Choose event type</div>
            <button onClick={() => setShowPicker(false)} style={{ fontSize: 12, color: "#8A8270", background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ padding: "8px" }}>
            {Object.entries(LIFE_EVENT_TYPES).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => addEvent(key)}
                style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderRadius: 6, display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 2 }}
                onMouseEnter={e => e.currentTarget.style.background = "#EAF0EC"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: "#8A8270" }}>{meta.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          style={{ width: "100%", padding: "10px", border: "1.5px dashed #D8D2C4", borderRadius: 10, background: "#FBFAF6", fontSize: 13, color: "#2E4A3D", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          + Add life event
        </button>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F2EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Spectral, serif", fontSize: 22, color: "#21241E", marginBottom: 12 }}>
          Independent<span style={{ color: "#2E4A3D" }}> Means</span>
        </div>
        <div style={{ fontSize: 12, color: "#9DB0A1" }}>Loading your plan…</div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function IndependentMeans() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData]               = useState({ ...EMPTY_DATA });
  const [stage, setStage]             = useState(1);
  const [showPricing, setShowPricing] = useState(false);
  const [showAdmin,   setShowAdmin]   = useState(false);
  const isAdmin = user?.email === import.meta.env.VITE_ADMIN_EMAIL;
  const scrollRef  = useRef(null);
  const saveTimer  = useRef(null);

  const entitlement = useEntitlement(user?.id);

  // Handle return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("checkout");
    if (result === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      entitlement.refreshSubscription?.();
      trackSubscriptionActivated(params.get("plan") ?? "unknown");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadPlan(u.id);
      else setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadPlan(u.id);
      else { setData({ ...EMPTY_DATA }); setStage(1); setAuthLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadPlan(userId) {
    setAuthLoading(true);
    const { data: row } = await supabase
      .from("plans")
      .select("data, stage")
      .eq("user_id", userId)
      .maybeSingle();
    if (row) {
      setData(parseData(row.data));
      setStage(Math.max(1, Math.min(7, row.stage || 1)));
    }
    setAuthLoading(false);
  }

  function savePlan(nextData, nextStage) {
    if (!user) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from("plans").upsert(
        { user_id: user.id, data: nextData, stage: nextStage },
        { onConflict: "user_id" }
      );
    }, 800);
  }

  function set(field, value) {
    setData(prev => {
      const next = { ...prev, [field]: value };
      savePlan(next, stage);
      return next;
    });
  }

  function setMany(updates) {
    setData(prev => {
      const next = { ...prev, ...updates };
      savePlan(next, stage);
      return next;
    });
  }

  function goTo(s) {
    setStage(s);
    savePlan(data, s);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 50);
  }

  function next() { goTo(Math.min(stage + 1, 7)); }
  function back() { goTo(Math.max(stage - 1, 1)); }

  if (authLoading || entitlement.isLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const progress = ((stage - 1) / 6) * 100;
  const currentStage = STAGES[stage - 1];

  const stageHasData = {
    1: !!(data.firstName || data.age),
    2: !!(data.grossIncome || (data.budgetItems || []).length > 0),
    3: (data.assetItems || []).length > 0,
    4: !!(data.ppOrValue || (data.investmentProperties || []).length > 0 || data.mortgageBalance),
    5: !!(data.superBalance || data.targetRetirementSpending),
    6: stage >= 6,
    7: stage >= 7,
  };

  const allIPs = data.investmentProperties || [];
  const _at = deriveAssetTotals(data.assetItems);
  const totalAssets = [_at.cashSavings, _at.sharesEtfs, _at.managedFunds,
    _at.crypto, _at.otherInvestments, data.superBalance, data.ppOrValue,
    ...allIPs.map(ip => ip.value)]
    .reduce((sum, v) => sum + (parseFloat(String(v).replace(/,/g, "")) || 0), 0);
  const totalDebt = [data.mortgageBalance, data.creditCardDebt, data.personalLoanDebt, data.hecsDebt,
    ...allIPs.map(ip => ip.mortgageBalance)]
    .reduce((sum, v) => sum + (parseFloat(String(v).replace(/,/g, "")) || 0), 0);
  const netWorth = totalAssets - totalDebt;
  const monthlyLiquid = _at.cashSavings;
  const monthlyExp = parseFloat(String(data.monthlyExpenses).replace(/,/g, "")) || 1;
  const runway = monthlyLiquid > 0 && monthlyExp > 0 ? (monthlyLiquid / monthlyExp).toFixed(1) : "—";

  return (
    <EntitlementContext.Provider value={{ ...entitlement, openPricing: () => setShowPricing(true) }}>
    <div style={{ minHeight: "100vh", background: "#F5F2EB", fontFamily: "'Albert Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Albert+Sans:wght@300;400;500;600&display=swap'); @keyframes bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-5px); opacity: 1; } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } * { box-sizing: border-box; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }"}</style>
      <style>{`:root {
  --color-pine:#2E4A3D; --color-paper:#F5F2EB; --color-ink:#21241E;
  --color-gold:#C2A06B; --color-sage:#9DB0A1; --color-stone:#D8D2C4;

  --chart-networth:#2E4A3D; --chart-savings:#6E8A6F; --chart-contributions:#9A7B43;
  --chart-spending:#A8694E; --chart-tax:#7C7A93; --chart-liabilities:#B0A07C;

  --fill-networth-top:rgba(46,74,61,0.16); --fill-networth-bottom:rgba(46,74,61,0.00);
  --fill-savings-top:rgba(110,138,111,0.15); --fill-savings-bottom:rgba(110,138,111,0.00);
  --fill-spending-top:rgba(168,105,78,0.14); --fill-spending-bottom:rgba(168,105,78,0.00);
  --fill-tax-top:rgba(124,122,147,0.13); --fill-tax-bottom:rgba(124,122,147,0.00);

  --event-goal:#C2A06B; --event-retire:#2E4A3D; --event-family:#A8694E;
  --event-property:#8A6D3B; --event-career:#6E8A6F; --event-warning:#9E5B4A;
  --event-ring:#FBFAF6;

  --chart-gridline:rgba(33,36,30,0.06); --chart-axis-label:#8A8270;
  --chart-baseline:#D8D2C4; --chart-cursor:rgba(33,36,30,0.28);
  --chart-goal-line:#C2A06B;

  --tooltip-bg:#FBFAF6; --tooltip-border:#ECE7DB;
  --tooltip-shadow:0 4px 16px rgba(33,36,30,0.10);
  --tooltip-text:#21241E; --tooltip-label:#6B6655;

  --pine-100:#2E4A3D; --pine-70:#5A7264; --pine-40:#97A89B; --pine-20:#C8D1C9;
}
@media print {
  .no-print { display: none !important; }
  body, html { background: white !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { margin: 12mm 10mm; size: A4 portrait; }
}
@media (max-width: 480px) {
  .app-subtitle { max-width: 44vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .metrics-bar { gap: 16px !important; padding: 8px 16px !important; }
  .metrics-bar > div > div:first-child { font-size: 7px !important; }
  .metrics-bar > div > div:last-child { font-size: 13px !important; }
  .scenario-comparison-grid { grid-template-columns: 1fr !important; }
  .metrics-card-grid { grid-template-columns: 1fr !important; }
  .fire-card-grid { grid-template-columns: 1fr !important; }
}`}</style>

      <header className="no-print" style={{ background: "#FBFAF6", borderBottom: "1px solid #ECE7DB", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 20, color: "#21241E" }}>
            Independent<span style={{ color: "#2E4A3D" }}> Means</span>
          </div>
          <div className="app-subtitle" style={{ fontSize: 10, color: "#8A8270", letterSpacing: "0.08em", textTransform: "uppercase" }}>Personal Financial Modelling & Scenario Planning</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {data.firstName && <div style={{ fontSize: 12, color: "#6B6655" }}>Hi, {data.firstName} 👋</div>}
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              style={{ fontSize: 11, color: "#8A8270", background: "none", border: "1px solid #ECE7DB", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
            >Analytics</button>
          )}
          <PremiumGate featureId={FEATURES.MULTI_PLAN} label="Multiple plans" onOpenPricing={() => setShowPricing(true)}>
            <button
              style={{ fontSize: 11, color: "#2E4A3D", background: "none", border: "1px solid #9DB0A1", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
            >+ New plan</button>
          </PremiumGate>
          {entitlement.status === "active" && (
            <button
              onClick={() => entitlement.openPortal()}
              style={{ fontSize: 11, color: "#2E4A3D", background: "none", border: "1px solid #9DB0A1", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
            >Billing</button>
          )}
          {entitlement.status === "free" && (
            <button
              onClick={() => setShowPricing(true)}
              style={{ fontSize: 11, color: "#F5F2EB", background: "#2E4A3D", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >Upgrade</button>
          )}
          <button
            onClick={async () => { if (window.confirm("Clear all saved data? This cannot be undone.")) { await supabase.from("plans").delete().eq("user_id", user.id); setData({ ...EMPTY_DATA }); setStage(1); } }}
            style={{ fontSize: 11, color: "#8A8270", background: "none", border: "1px solid #ECE7DB", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >Clear data</button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ fontSize: 11, color: "#8A8270", background: "none", border: "1px solid #ECE7DB", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >Sign out</button>
        </div>
      </header>

      <TrialBanner isTrial={entitlement.isTrial} trialDaysLeft={entitlement.trialDaysLeft} onOpenPricing={() => setShowPricing(true)} />

      <div className="no-print" style={{ background: "white", borderBottom: "1px solid #ECE7DB", padding: "0 28px 14px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {STAGES.map(s => {
            const isActive = s.id === stage;
            const hasData  = stageHasData[s.id];
            return (
              <button key={s.id} onClick={() => goTo(s.id)}
                style={{
                  flex: 1, padding: "6px 0", border: "none",
                  background: isActive ? "#2E4A3D" : s.id < stage ? "#D8D2C4" : "#ECE7DB",
                  borderRadius: 6, cursor: "pointer", position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all 0.2s",
                }}>
                <div style={{ fontSize: 12 }}>{s.icon}</div>
                <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.04em", color: isActive ? "#EDE7D7" : s.id < stage ? "#2E4A3D" : "#9DB0A1", textTransform: "uppercase" }}>{s.label}</div>
                {hasData && !isActive && (
                  <div style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "#2E4A3D" }} />
                )}
              </button>
            );
          })}
        </div>
        <div style={{ height: 3, background: "#ECE7DB", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", background: "#C2A06B", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {(data.grossIncome || data.superBalance || (data.assetItems || []).length > 0) && (
        <div className="no-print metrics-bar" style={{ background: "#2E4A3D", padding: "10px 28px", display: "flex", gap: 24, overflowX: "auto" }}>
          {[
            { label: "Net Worth", value: currency(netWorth) },
            { label: "Super", value: currency(data.superBalance) },
            { label: "Monthly Savings", value: currency(data.savingsPerMonth) },
            { label: "Emergency Runway", value: runway === "—" ? "—" : (runway + " mo") },
            { label: "Scenario", value: { base: "Base", conservative: "Conservative", aggressive: "Aggressive" }[data.activeScenario] || "Base" },
          ].map((item, i) => (
            <div key={i} style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: "rgba(237,231,215,0.65)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#EDE7D7", marginTop: 1 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "32px 20px 100px" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div className="no-print" style={{ marginBottom: 28, animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontSize: 11, color: "#8A8270", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Step {stage} of 7</div>
            <div style={{ fontFamily: "Spectral, serif", fontSize: 28, color: "#21241E", marginBottom: 4 }}>{currentStage.title}</div>
            <div style={{ fontSize: 14, color: "#6B6655" }}>{currentStage.subtitle}</div>
          </div>

          <div ref={scrollRef} style={{ background: "#FBFAF6", borderRadius: 18, border: "1px solid #ECE7DB", padding: "28px", animation: "fadeIn 0.25s ease", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
            {stage === 1 && <Stage1 data={data} set={set} />}
            {stage === 2 && <Stage2 data={data} setMany={setMany} />}
            {stage === 3 && <AssetStage3 data={data} setMany={setMany} />}
            {stage === 4 && <Stage4 data={data} set={set} />}
            {stage === 5 && <Stage5 data={data} set={set} />}
            {stage === 6 && <AnalysisScreen data={data} set={set} entitlement={entitlement} />}
            {stage === 7 && <ActionPlanScreen data={data} entitlement={entitlement} />}
          </div>

          {stage < 6 && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              {stage > 1 ? (
                <button onClick={back} style={{ padding: "12px 24px", border: "1.5px solid #D8D2C4", borderRadius: 12, background: "#FBFAF6", fontSize: 14, color: "#6B6655", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              ) : <div />}
              <button onClick={next} style={{ padding: "12px 28px", border: "none", borderRadius: 12, background: "#C2A06B", color: "#2A2113", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(194,160,107,0.3)" }}>
                {stage === 5 ? "View My Analysis →" : "Continue →"}
              </button>
            </div>
          )}

          {stage === 6 && (
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <button onClick={back} style={{ padding: "12px 24px", border: "1.5px solid #D8D2C4", borderRadius: 12, background: "#FBFAF6", fontSize: 14, color: "#6B6655", cursor: "pointer", fontFamily: "inherit" }}>← Edit my details</button>
              <button onClick={next} style={{ padding: "12px 28px", border: "none", borderRadius: 12, background: "#C2A06B", color: "#2A2113", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(194,160,107,0.3)" }}>View Plan Summary →</button>
            </div>
          )}

          {stage === 7 && (
            <div className="no-print" style={{ marginTop: 20 }}>
              <button onClick={back} style={{ padding: "12px 24px", border: "1.5px solid #D8D2C4", borderRadius: 12, background: "#FBFAF6", fontSize: 14, color: "#6B6655", cursor: "pointer", fontFamily: "inherit" }}>← Back to Analysis</button>
            </div>
          )}
        </div>
      </div>

      <footer className="no-print" style={{ background: "white", borderTop: "1px solid #ECE7DB", padding: "16px 28px", textAlign: "center", marginTop: "auto" }}>
        <div style={{ fontSize: 11, color: "#8A8270", lineHeight: 1.6, maxWidth: 620, margin: "0 auto" }}>
          <strong style={{ color: "#6B6655" }}>General information only.</strong> Independent Means is an educational planning tool and does not provide personal financial advice. All projections and analysis are illustrative estimates based on the information you enter. Before making financial decisions, consider seeking advice from a licensed Australian financial adviser (AFSL holder). Past performance is not a reliable indicator of future performance.
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#9DB0A1" }}>
          <a href="/privacy.html" style={{ color: "#9DB0A1", textDecoration: "none" }} onMouseOver={e => e.target.style.color="#6B6655"} onMouseOut={e => e.target.style.color="#9DB0A1"}>Privacy Policy</a>
          {" · "}
          <a href="/terms.html" style={{ color: "#9DB0A1", textDecoration: "none" }} onMouseOver={e => e.target.style.color="#6B6655"} onMouseOut={e => e.target.style.color="#9DB0A1"}>Terms of Service</a>
        </div>
      </footer>

      {showAdmin   && <AdminDashboard onClose={() => setShowAdmin(false)} />}
      {showPricing && (
        <PricingPage user={user} onClose={() => setShowPricing(false)} />
      )}
    </div>
    </EntitlementContext.Provider>
  );
}
