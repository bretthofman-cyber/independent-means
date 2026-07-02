import { useState, useRef } from "react";
import { DEFAULT_SCENARIOS, runEngine } from "./engine.js";
import { LIFE_EVENT_TYPES, newLifeEvent } from "./lifeEvents.js";
import { generateWarnings } from "./warnings.js";
import { generatePlanItems, PLAN_CATEGORIES } from "./actionPlan.js";
import { currency, Field, Input, Select, Toggle, TwoCol, SectionDivider } from "./ui.jsx";
import Stage2, { BUDGET_CATS, budgetTotal, itemMonthly, estimateNetMonthly, CashflowCalendar, buildCashflowCalendar } from "./BudgetStage.jsx";
import AssetStage3, { deriveAssetTotals } from "./AssetStage.jsx";

const STORAGE_KEY = "clearpath_v1";

const ASSUMPTION_RATIONALE = {
  returnRate: {
    label: "Investment return (% p.a.)",
    source: "Based on long-run Australian diversified portfolio returns. Vanguard's 2024 Economic and Market Outlook projects Australian balanced fund returns of 5–8% p.a. over 10 years. The Base case reflects a 60/40 growth/defensive portfolio.",
  },
  inflation: {
    label: "Inflation (% p.a.)",
    source: "Reserve Bank of Australia (RBA) target band is 2–3%. Base case uses 2.5% (RBA midpoint). Conservative uses 3.0% reflecting stagflation or persistent cost pressure risk. Aggressive uses 2.0% reflecting productivity-led benign inflation.",
  },
  propertyGrowth: {
    label: "Property growth (% p.a.)",
    source: "Based on long-run Australian residential property capital growth data. CoreLogic's 30-year average is approximately 5.4% nationally; however, this includes periods of above-trend growth. Base case uses a modest 4.5% reflecting regulatory and affordability headwinds.",
  },
  rentalGrowth: {
    label: "Rental income growth (% p.a.)",
    source: "Base case of 3.0% reflects CPI plus modest real growth — consistent with long-run rental market trends per ABS rental price indexes. Conservative aligns with CPI only; Aggressive reflects tight rental market conditions.",
  },
  safeWithdrawal: {
    label: "Safe withdrawal rate (% p.a.)",
    source: "The 4% rule originates from the Bengen (1994) study and is widely referenced in personal financial modelling & scenario planning. ASFA and Vanguard research suggests 3.5–4.5% is a reasonable sustainable drawdown rate for a 25–30 year retirement, depending on portfolio composition.",
  },
};

const STAGES = [
  { id: 1, label: "Profile",  icon: "👤", title: "Household Profile",     subtitle: "Let's start with the basics" },
  { id: 2, label: "Income",   icon: "💰", title: "Income & Cashflow",      subtitle: "Your earnings and spending" },
  { id: 3, label: "Assets",   icon: "🏦", title: "Assets & Savings",       subtitle: "What you own and hold" },
  { id: 4, label: "Property", icon: "🏠", title: "Property & Debt",        subtitle: "Leverage and obligations" },
  { id: 5, label: "Super",    icon: "📈", title: "Super & Goals",           subtitle: "Retirement engine and priorities" },
  { id: 6, label: "Analysis", icon: "✦",  title: "Your Financial Picture", subtitle: "Scenario, projections & discussion points" },
  { id: 7, label: "Plan",     icon: "📋", title: "Your Plan Summary",      subtitle: "Observations based on your inputs" },
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
  insuranceAnnualPremium: "",
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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_DATA };
    const parsed = JSON.parse(raw);
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

    return {
      ...EMPTY_DATA,
      ...parsed,
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

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function loadStage() {
  try { return Math.max(1, Math.min(7, parseInt(localStorage.getItem("clearpath_stage") || "1") || 1)); } catch { return 1; }
}

function saveStage(s) {
  try { localStorage.setItem("clearpath_stage", String(s)); } catch {}
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
              Welcome to Clearpath
            </div>
            <div style={{ fontSize: 12, color: "#6B6655", lineHeight: 1.6 }}>
              A 7-step modelling tool for Australian households. Enter your details to project super, net worth, retirement funding probability, and cashflow — all calculated locally, never sent anywhere.
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
      <SectionDivider label="Private health insurance" />
      <Field label={data.hasPartner === "yes" ? "Your hospital cover" : "Hospital-level private health cover"} hint="Affects Medicare Levy Surcharge — 1–1.5% extra if no cover">
        <Toggle value={data.privateHealthInsurance} onChange={v => set("privateHealthInsurance", v)}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No cover" }]} />
      </Field>
      {data.hasPartner === "yes" && (
        <Field label={`${data.partnerName || "Partner"}'s hospital cover`}>
          <Toggle value={data.partnerPrivateHealthInsurance} onChange={v => set("partnerPrivateHealthInsurance", v)}
            options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No cover" }]} />
        </Field>
      )}
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
                    Interest only until <strong>{expiryYear}</strong> — reverts to P&I repayments from {expiryYear} until loan end in <strong>{endYear}</strong>.
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
          <Field label="Management fee" hint="% of gross rent — default 8%">
            <Input value={ip.managementFee} onChange={v => upd("managementFee", v)} placeholder="8" suffix="%" />
          </Field>
          <SectionDivider label="Annual expenses" />
          <TwoCol>
            <Field label="Council rates"><Input value={ip.councilRates} onChange={v => upd("councilRates", v)} placeholder="2,000" prefix="$" /></Field>
            <Field label="Landlord insurance"><Input value={ip.insurance} onChange={v => upd("insurance", v)} placeholder="1,500" prefix="$" /></Field>
          </TwoCol>
          <TwoCol>
            <Field label="Body corp — admin" hint="Operating fund levy">
              <Input value={ip.bodyCorpAdmin} onChange={v => upd("bodyCorpAdmin", v)} placeholder="0" prefix="$" />
            </Field>
            <Field label="Body corp — capital" hint="Sinking fund levy">
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
              <Field label="Your ownership share" hint="% you own — remainder is partner's">
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
          <Field label="Mortgage start year" hint="Year the loan was taken out — used to calculate remaining term">
            <Input value={data.mortgageStartYear} onChange={v => set("mortgageStartYear", v)} placeholder={String(new Date().getFullYear())} type="number" />
          </Field>
          <Field label="Offset account balance" hint="Reduces effective mortgage interest — enter your current offset balance">
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
                    Interest only until <strong>{expiryYear}</strong> — reverts to P&I repayments from {expiryYear} until loan end in <strong>{endYear}</strong>.
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
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px", border: "1.5px solid #D8D2C4", borderRadius: 10, background: "#FBFAF6", marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E", marginBottom: 2 }}>Enable debt recycling</div>
              <div style={{ fontSize: 11, color: "#8A8270", lineHeight: 1.5 }}>
                Converts non-deductible mortgage interest to deductible investment debt as you repay and redraw. Modelled as an annual tax saving added to liquid savings. General information only — consult a tax adviser before implementing.
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
            ? `Warning: ${currency(currentSS)}/yr exceeds the ${currency(capRoom)}/yr cap room — excess concessional contributions are taxed at your marginal rate (less a 15% offset).`
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
      <TwoCol>
        <Field label="Your carry-forward cap available" hint="From ATO online services — leave blank if not applicable">
          <Input value={data.carryForwardCap} onChange={v => set("carryForwardCap", v)} placeholder="0" prefix="$" />
        </Field>
        {data.hasPartner === "yes" && (
          <Field label={`${data.partnerName || "Partner"}'s carry-forward cap`} hint="From ATO online services">
            <Input value={data.partnerCarryForwardCap} onChange={v => set("partnerCarryForwardCap", v)} placeholder="0" prefix="$" />
          </Field>
        )}
      </TwoCol>

      <SectionDivider label="Franking credits" />
      <div style={{ fontSize: 12, color: "#8A8270", marginBottom: 12, lineHeight: 1.5 }}>
        Annual franking credits from Australian shares or managed funds. These offset your income tax — any excess is refunded by the ATO. Check your dividend statements or last year's tax return.
      </div>
      <TwoCol>
        <Field label="Your annual franking credits" hint="From dividends — shown on dividend statements">
          <Input value={data.frankingCredits} onChange={v => set("frankingCredits", v)} placeholder="0" prefix="$" />
        </Field>
        {data.hasPartner === "yes" && (
          <Field label={`${data.partnerName || "Partner"}'s franking credits`}>
            <Input value={data.partnerFrankingCredits} onChange={v => set("partnerFrankingCredits", v)} placeholder="0" prefix="$" />
          </Field>
        )}
      </TwoCol>

      <SectionDivider label="Retirement target & life events" />
      <Field label="Target annual retirement spending" hint="In today's dollars — what lifestyle do you want in retirement?">
        <Input value={data.targetRetirementSpending} onChange={v => set("targetRetirementSpending", v)} placeholder="65,000" prefix="$" />
      </Field>

      <LifeEventsPanel data={data} set={set} />
    </div>
  );
}

// ─── STAGE 6 — GOALS & SCENARIOS ─────────────────────────────────────────────

function AssumptionRow({ fieldKey, value, defaultValue, onChange, isCustom }) {
  const meta = ASSUMPTION_RATIONALE[fieldKey];
  const [showSource, setShowSource] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{meta.label}</div>
        <button
          onClick={() => setShowSource(s => !s)}
          style={{ fontSize: 11, color: "#2E4A3D", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          {showSource ? "Hide source" : "Why this number?"}
        </button>
      </div>
      {showSource && (
        <div style={{
          background: "#EAF0EC", border: "1px solid #D8D2C4", borderRadius: 8,
          padding: "10px 12px", fontSize: 12, color: "#3C5247", lineHeight: 1.6, marginBottom: 8,
        }}>
          {meta.source}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          disabled={!isCustom}
          step="0.1"
          style={{
            flex: 1, padding: "9px 12px", border: "1.5px solid",
            borderColor: isCustom ? "#2E4A3D" : "#ECE7DB",
            borderRadius: 8, fontSize: 14, color: isCustom ? "#21241E" : "#8A8270",
            background: isCustom ? "#FBFAF6" : "#F5F2EB",
            outline: "none", fontFamily: "inherit",
          }}
        />
        <span style={{ fontSize: 13, color: "#6B6655", width: 20 }}>%</span>
        {isCustom && value !== defaultValue && (
          <button
            onClick={() => onChange(defaultValue)}
            style={{ fontSize: 11, color: "#9a3922", background: "none", border: "1px solid #f0d0c4", borderRadius: 6, padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function ScenarioPanel({ scenarioKey, label, data, set, isActive, isExpanded, onToggle, isCustom }) {
  const assumptions = isCustom
    ? (data.customAssumptions?.[scenarioKey] || DEFAULT_SCENARIOS[scenarioKey])
    : DEFAULT_SCENARIOS[scenarioKey];

  function updateAssumption(field, value) {
    const updated = {
      ...data.customAssumptions,
      [scenarioKey]: {
        ...(data.customAssumptions?.[scenarioKey] || DEFAULT_SCENARIOS[scenarioKey]),
        [field]: value,
      },
    };
    set("customAssumptions", updated);
  }

  const colors = {
    base: { bg: "#EAF0EC", border: "#D8D2C4", active: "#2E4A3D" },
    conservative: { bg: "#F5F0E8", border: "#D8D2C4", active: "#7A5E30" },
    aggressive: { bg: "#eaf0f7", border: "#c4d5e8", active: "#3a5a8a" },
  };
  const c = colors[scenarioKey];

  return (
    <div style={{
      border: "2px solid", borderColor: isActive ? c.active : c.border,
      borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "12px 16px", background: isActive ? c.bg : "white",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", border: "2px solid",
            borderColor: isActive ? c.active : "#D8D2C4",
            background: isActive ? c.active : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? c.active : "#21241E" }}>{label}</div>
        </div>
        <div style={{ fontSize: 12, color: "#8A8270" }}>
          {assumptions.returnRate}% return · {assumptions.inflation}% inflation · {assumptions.propertyGrowth}% property
        </div>
      </button>

      {isExpanded && (
        <div style={{ padding: "16px", background: "white", borderTop: "1px solid", borderColor: c.border }}>
          {Object.keys(ASSUMPTION_RATIONALE).map(key => (
            <AssumptionRow
              key={key}
              fieldKey={key}
              value={assumptions[key]}
              defaultValue={DEFAULT_SCENARIOS[scenarioKey][key]}
              onChange={v => updateAssumption(key, v)}
              isCustom={isCustom}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function goalAnnualAdditive(goals) {
  return (goals || []).filter(g => g.additive && g.amount).reduce((sum, g) => {
    const a = parseFloat(String(g.amount).replace(/,/g, "")) || 0;
    if (g.frequency === "monthly")   return sum + a * 12;
    if (g.frequency === "quarterly") return sum + a * 4;
    return sum + a;
  }, 0);
}

// Goals legacy — kept for backward-compat projection calculation only; no longer shown in UI
const GOAL_OPTIONS = [];

// ─── WARNINGS PANEL ───────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  critical: { bg: "#fdf0ed", border: "#e8a090", text: "#7a2510", badge: "#c0392b", badgeFg: "white" },
  high:     { bg: "#fef8ed", border: "#e8c47a", text: "#7a5010", badge: "#C2A06B", badgeFg: "#2A2113" },
  medium:   { bg: "#f0f4fa", border: "#b8cde0", text: "#2a4060", badge: "#3a5a8a", badgeFg: "white"  },
  info:     { bg: "#EAF0EC", border: "#C8D8CC", text: "#2E4A3D", badge: "#2E4A3D", badgeFg: "white"  },
};

function WarningsPanel({ data, engine }) {
  const [expanded, setExpanded] = useState(null);
  const warnings = generateWarnings(data, engine);
  if (warnings.length === 0) return null;

  const criticalCount = warnings.filter(w => w.severity === "critical").length;
  const highCount     = warnings.filter(w => w.severity === "high").length;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 10 }}>
        Scenario Flags
        {criticalCount > 0 && (
          <span style={{ marginLeft: 8, background: "#c0392b", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>
            {criticalCount} critical
          </span>
        )}
        {highCount > 0 && (
          <span style={{ marginLeft: 6, background: "#C2A06B", color: "#2A2113", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10 }}>
            {highCount} high
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {warnings.map(w => {
          const c = SEVERITY_COLORS[w.severity] || SEVERITY_COLORS.info;
          const isOpen = expanded === w.id;
          return (
            <div key={w.id} style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
              <button
                onClick={() => setExpanded(isOpen ? null : w.id)}
                style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 8px", borderRadius: 10, background: c.badge, color: c.badgeFg, flexShrink: 0 }}>
                  {w.severity}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: c.text, flex: 1 }}>{w.title}</span>
                <span style={{ fontSize: 11, color: c.text, opacity: 0.6 }}>{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${c.border}` }}>
                  <p style={{ fontSize: 13, color: c.text, lineHeight: 1.6, margin: "10px 0 0" }}>{w.message}</p>
                  {w.hint && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.6)", borderRadius: 8, fontSize: 12, color: c.text, lineHeight: 1.5, opacity: 0.85 }}>
                      {w.hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
                          options={[{ value: "yes", label: "Yes — 50% discount applies" }, { value: "no", label: "No — full gain taxable" }]}
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

// ─── FIRE PANEL ───────────────────────────────────────────────────────────────

function FIREPanel({ engine, data }) {
  const fire    = engine?.fire;
  const metrics = engine?.metrics;
  const hasTarget = parseFloat(String(data.targetRetirementSpending || "").replace(/,/g, "")) > 0;

  if (!fire || !hasTarget) return null;

  const retirementAge = parseInt(data.retirementAge) || 65;
  const currentAge    = parseInt(data.age) || 0;

  const cards = [
    {
      label: "FIRE Number",
      value: fire.fireNumber > 0 ? currency(fire.fireNumber) : "—",
      sub: `${engine.assumptions?.safeWithdrawal ?? 4}% safe withdrawal rate`,
      ok: null,
    },
    {
      label: "Coast FIRE Number",
      value: fire.coastFireNumber > 0 ? currency(fire.coastFireNumber) : "—",
      sub: fire.isCoastFIRE ? "Already at Coast FIRE" : `Balance needed today to stop contributing`,
      ok: fire.isCoastFIRE ? true : null,
    },
    {
      label: "Years to FI",
      value: fire.yearsToFI !== null ? (fire.yearsToFI === 0 ? "Now" : `${fire.yearsToFI} yrs`) : "—",
      sub: fire.projectedFIAge ? `Age ${fire.projectedFIAge}` : "Increase savings rate to calculate",
      ok: fire.projectedFIAge && fire.projectedFIAge < retirementAge ? true : null,
    },
    ...(fire.bridgeYears > 0 ? [{
      label: "Bridge Fund Needed",
      value: currency(fire.bridgeFundNeeded),
      sub: `${fire.bridgeYears} yrs before super access (age 60)`,
      ok: false,
    }] : []),
  ];

  const subColor = ok => ok === true ? "#2E4A3D" : ok === false ? "#9a3922" : "#8A8270";

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 10 }}>
        FIRE Analysis
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {cards.map((card, i) => (
          <div key={i} style={{ background: "#FBFAF6", border: "1.5px solid #ECE7DB", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 19, fontWeight: 500, color: "#21241E", fontFamily: "Spectral, serif", marginBottom: 4 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: subColor(card.ok), fontWeight: 500 }}>{card.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#9DB0A1", lineHeight: 1.5, padding: "6px 12px", background: "#F5F2EB", borderRadius: 8 }}>
        FIRE figures are scenario estimates based on the assumptions above. They do not constitute advice and are not guaranteed. Tax on investment income, sequence-of-returns risk, and inflation variability are material factors not fully captured in these simplified numbers.
      </div>
    </div>
  );
}

// ─── PROJECTION TABLE ─────────────────────────────────────────────────────────

function ProjectionTable({ engine, data }) {
  const [open, setOpen] = useState(false);
  const traj = engine?.trajectory;
  if (!traj || traj.length < 2) return null;

  const rows = traj.filter((_, i) => i % 1 === 0); // every year

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "10px 14px", background: "#F5F2EB", border: "1px solid #ECE7DB", borderRadius: 10, fontFamily: "inherit", fontSize: 12, color: "#6B6655", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span style={{ fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10, color: "#8A8270" }}>Year-by-Year Projection</span>
        <span>{open ? "Collapse ▲" : "Expand ▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8, background: "white", border: "1.5px solid #ECE7DB", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F5F2EB", borderBottom: "1.5px solid #D8D2C4" }}>
                  {["Age","Year","Super","Liquid","Property","Total Debt","Net Worth","Events"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Age" || h === "Year" ? "center" : "right", fontWeight: 600, color: "#6B6655", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.age} style={{ background: row.isRetired ? "#EAF0EC" : i % 2 === 0 ? "white" : "#FBFAF6", borderBottom: "1px solid #F0ECE4" }}>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: "#21241E", fontFamily: "Spectral, serif", fontWeight: 500 }}>{row.age}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", color: "#8A8270" }}>{row.year}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#21241E" }}>{row.superBalance != null ? currency(row.superBalance) : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#21241E" }}>{row.liquidAssets != null ? currency(row.liquidAssets) : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#21241E" }}>{row.propertyValue != null ? currency(row.propertyValue) : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#9a3922" }}>{row.totalDebt != null ? currency(row.totalDebt) : "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: row.netWorth >= 0 ? "#2E4A3D" : "#9a3922" }}>{currency(row.netWorth)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "left", color: "#8A8270", fontSize: 10 }}>
                      {row.isRetired && <span style={{ background: "#EAF0EC", color: "#2E4A3D", padding: "1px 5px", borderRadius: 4, marginRight: 4 }}>Retired</span>}
                      {(row.eventTypes || []).map(t => {
                        const meta = LIFE_EVENT_TYPES[t] || {};
                        return <span key={t} title={meta.label || t} style={{ marginRight: 4 }}>{meta.icon || "📅"}</span>;
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "8px 14px", fontSize: 10, color: "#9DB0A1", borderTop: "1px solid #F0ECE4" }}>
            Nominal dollars. Property value includes PPOR and investment properties. Debt includes all modelled liabilities. Retirement highlighted in green. Life event icons shown in the Events column — hover for label. General information only.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ANALYSIS SCREEN ─────────────────────────────────────────────────────────


function MetricsRow({ engine, data }) {
  const { metrics, drawdown, mortgage } = engine;
  const retirementAge = parseFloat(data.retirementAge) || 65;
  const lifeExpectancy = parseFloat(data.lifeExpectancy) || 90;
  const hasSpendingTarget = parseFloat(String(data.targetRetirementSpending).replace(/,/g, "")) > 0;

  // Card 1 — Projected super
  const superOk = metrics.onTrack;
  const superSub = hasSpendingTarget
    ? (superOk
        ? `+${currency(metrics.superSurplus)} surplus`
        : `−${currency(Math.abs(metrics.superSurplus))} short`)
    : "Enter spending target";

  // Card 2 — Debt-free date
  let debtValue, debtSub, debtOk;
  if (!mortgage || !parseFloat(String(data.mortgageBalance).replace(/,/g, ""))) {
    debtValue = "No mortgage"; debtSub = null; debtOk = true;
  } else if (mortgage.type === "io") {
    debtValue = "Interest only"; debtSub = "Principal never reduces"; debtOk = false;
  } else {
    debtValue = String(mortgage.debtFreeYear);
    debtSub = `${mortgage.yearsToPayoff} yrs · ${currency(mortgage.monthlyPayment)}/mo`;
    debtOk = true;
  }

  // Card 3 — Funded to age
  let fundedValue, fundedSub, fundedOk;
  if (!hasSpendingTarget) {
    fundedValue = "—"; fundedSub = "Enter spending target"; fundedOk = null;
  } else if (metrics.lastsToLifeExpectancy) {
    fundedValue = `Age ${lifeExpectancy}`; fundedSub = "Full life expectancy"; fundedOk = true;
  } else if (metrics.depletionAge) {
    fundedValue = `Age ${metrics.depletionAge}`;
    fundedSub = `${metrics.depletionAge - retirementAge} yrs into retirement`;
    fundedOk = false;
  } else {
    fundedValue = "—"; fundedSub = null; fundedOk = null;
  }

  // Card 4 — Net worth at retirement
  const nwOk = metrics.retirementNetWorth > 0;

  // Card 5 — FIRE number
  const fireValue  = metrics.fireNumber > 0 ? currency(metrics.fireNumber) : "—";
  const fireSub2   = metrics.fireNumber > 0 ? `at ${engine.assumptions?.safeWithdrawal ?? 4}% withdrawal rate` : null;
  const fireSub    = metrics.fireNumber > 0
    ? (metrics.projectedSuper >= metrics.fireNumber
        ? `On track — super exceeds target`
        : `${currency(metrics.fireNumber - metrics.projectedSuper)} gap`)
    : "Enter spending target";

  // Card 6 — Annual household tax
  const hasTax     = metrics.annualHouseholdTax > 0;
  const taxValue   = hasTax ? currency(metrics.annualHouseholdTax) : "—";
  const taxSub     = hasTax ? `${currency(metrics.annualAfterTax)}/yr after tax` : null;
  const taxSub2    = hasTax ? "total household tax" : null;

  const cards = [
    {
      label: "Projected Super",
      sub2: `at age ${retirementAge}`,
      value: currency(metrics.projectedSuper),
      sub: superSub,
      ok: hasSpendingTarget ? superOk : null,
    },
    {
      label: "Debt Free",
      sub2: mortgage?.type === "pi" ? "mortgage payoff" : null,
      value: debtValue,
      sub: debtSub,
      ok: debtOk,
    },
    {
      label: "Funded to Age",
      sub2: hasSpendingTarget ? `${currency(drawdown.futureSpending)}/yr in retirement` : null,
      value: fundedValue,
      sub: fundedSub,
      ok: fundedOk,
    },
    {
      label: "Net Worth at Retirement",
      sub2: `at age ${retirementAge}`,
      value: currency(metrics.retirementNetWorth),
      sub: null,
      ok: nwOk,
    },
    {
      label: "FIRE Number",
      sub2: fireSub2,
      value: fireValue,
      sub: hasSpendingTarget ? fireSub : "Enter spending target",
      ok: hasSpendingTarget ? (metrics.projectedSuper >= metrics.fireNumber ? true : false) : null,
    },
    {
      label: "Annual Tax",
      sub2: taxSub2,
      value: taxValue,
      sub: taxSub,
      ok: null,
    },
  ];

  const subColor = (ok) => ok === true ? "#2E4A3D" : ok === false ? "#9a3922" : "#8A8270";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: "#FBFAF6", border: "1.5px solid #ECE7DB",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#8A8270", marginBottom: 2,
          }}>
            {card.label}
          </div>
          {card.sub2 && (
            <div style={{ fontSize: 10, color: "#9DB0A1", marginBottom: 6 }}>{card.sub2}</div>
          )}
          <div style={{
            fontSize: 19, fontWeight: 500, color: "#21241E",
            fontFamily: "Spectral, serif",
            marginBottom: card.sub ? 4 : 0,
          }}>
            {card.value}
          </div>
          {card.sub && (
            <div style={{ fontSize: 11, color: subColor(card.ok), fontWeight: 500 }}>
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── RETIREMENT GAUGE ────────────────────────────────────────────────────────

function RetirementGauge({ successRate, color }) {
  const cx = 90, cy = 80, r = 62;
  const strokeW = 13;
  const arcLen = Math.PI * r;
  const filled = (Math.min(100, Math.max(0, successRate)) / 100) * arcLen;
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg viewBox="0 0 180 88" width="150" style={{ display: "block", flexShrink: 0 }}>
      <path d={bgPath} fill="none" stroke="#ECE7DB" strokeWidth={strokeW} strokeLinecap="round" />
      <path d={bgPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(1)} ${arcLen.toFixed(1)}`} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontFamily="Spectral, serif"
        fontSize="30" fill={color}>{successRate}%</text>
    </svg>
  );
}

// ─── MONTE CARLO CARD ─────────────────────────────────────────────────────────

function MonteCarloCard({ data, engine }) {
  const mc = engine?.monteCarlo;
  const hasTarget = parseFloat(String(data.targetRetirementSpending).replace(/,/g, "")) > 0;

  if (!hasTarget) return (
    <div style={{ background: "#F5F2EB", border: "1px solid #ECE7DB", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 6 }}>Retirement Probability</div>
      <div style={{ fontSize: 13, color: "#8A8270" }}>Enter a target retirement spending in Stage 5 to see Monte Carlo simulation</div>
    </div>
  );

  if (!mc) return null;

  const { successRate, retirementBalance, iterations, stdDev } = mc;
  const isStrong  = successRate >= 85;
  const isWatch   = successRate >= 70 && successRate < 85;
  const color = isStrong ? "#2E4A3D" : isWatch ? "#C2A06B" : "#9a3922";
  const bg    = isStrong ? "#EAF0EC" : isWatch ? "#FBF8F2" : "#fdf4f0";
  const bdr   = isStrong ? "#D8D2C4" : isWatch ? "#E4D8BC" : "#f0d0c4";
  const label = isStrong ? "Strong" : isWatch ? "Watch zone" : "Needs attention";
  const desc  = isStrong
    ? `High confidence your plan funds retirement to age ${data.lifeExpectancy || 90}`
    : isWatch
    ? "Some cashflow pressure in retirement — review your contributions and spending target"
    : "High risk of running short in retirement — consider increasing contributions or adjusting targets";

  return (
    <div style={{ background: bg, border: `1.5px solid ${bdr}`, borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 10 }}>
        Retirement Probability
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <RetirementGauge successRate={successRate} color={color} />
        <div style={{ paddingTop: 6, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}20`, padding: "3px 10px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>{label}</span>
          <div style={{ fontSize: 12, color: "#6B6655", lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 10, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Super at retirement — range</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>
            {currency(retirementBalance.p10)} — {currency(retirementBalance.p90)}
          </div>
          <div style={{ fontSize: 10, color: "#9DB0A1" }}>10th to 90th percentile</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Median outcome</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#21241E" }}>{currency(retirementBalance.p50)}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#9DB0A1" }}>{iterations.toLocaleString()} simulations</div>
          <div style={{ fontSize: 10, color: "#9DB0A1" }}>{Math.round(stdDev * 100)}% annual volatility</div>
        </div>
      </div>
    </div>
  );
}

// ─── NET WORTH CHART ──────────────────────────────────────────────────────────

function NetWorthChart({ engine, data }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const trajectory = engine?.trajectory;
  if (!trajectory || trajectory.length < 2) return null;

  const retirementAge = parseInt(data.retirementAge) || 65;
  const lifeExp       = parseInt(data.lifeExpectancy) || 90;
  const W = 600, H = 220;
  const mg = { top: 24, right: 20, bottom: 30, left: 70 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top - mg.bottom;

  const minAge = trajectory[0].age;
  const maxAge = trajectory[trajectory.length - 1].age;

  // All series
  const nws   = trajectory.map(t => t.netWorth);
  const sups  = trajectory.map(t => t.superBalance   || 0);
  const liqs  = trajectory.map(t => t.liquidAssets   || 0);
  const props = trajectory.map(t => t.propertyValue  || 0);

  // Show a series only if it's non-trivially non-zero
  const hasSuper = Math.max(...sups) > 1000;
  const hasLiq   = Math.max(...liqs) > 1000;
  const hasProp  = Math.max(...props) > 1000;

  // Y-scale covers all visible series
  const allVals = [...nws, ...(hasSuper ? sups : []), ...(hasLiq ? liqs : []), ...(hasProp ? props : [])];
  const rawMin = Math.min(0, ...allVals);
  const rawMax = Math.max(...allVals);
  const range  = rawMax - rawMin || 1;

  const xS = age => mg.left + ((age - minAge) / (maxAge - minAge)) * cW;
  const yS = v   => mg.top  + cH - ((v - rawMin) / range) * cH;

  const mkPath = key => trajectory.map((t, i) =>
    `${i === 0 ? "M" : "L"} ${xS(t.age).toFixed(1)} ${yS(t[key] || 0).toFixed(1)}`
  ).join(" ");

  const nwPath    = mkPath("netWorth");
  const superPath = mkPath("superBalance");
  const liqPath   = mkPath("liquidAssets");
  const propPath  = mkPath("propertyValue");

  const nwAreaPath =
    `M ${xS(minAge).toFixed(1)} ${yS(0).toFixed(1)} ` +
    trajectory.map(t => `L ${xS(t.age).toFixed(1)} ${yS(t.netWorth).toFixed(1)}`).join(" ") +
    ` L ${xS(maxAge).toFixed(1)} ${yS(0).toFixed(1)} Z`;

  const fmt = n => {
    const abs = Math.abs(n);
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
    if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
    return "$0";
  };

  const yTicks = [0, 1, 2, 3, 4].map(i => ({
    v: rawMin + (range / 4) * i,
    y: yS(rawMin + (range / 4) * i),
  }));

  // X-axis: current age + every 10 yrs + retirement + life expectancy
  const decadeAges = [];
  const firstDecade = Math.ceil(minAge / 10) * 10;
  for (let a = firstDecade; a <= maxAge; a += 10) {
    if (Math.abs(a - retirementAge) > 2 && Math.abs(a - minAge) > 2 && Math.abs(a - maxAge) > 2) {
      decadeAges.push(a);
    }
  }
  const xAxisAges = [minAge, ...decadeAges, retirementAge, maxAge]
    .filter((a, idx, arr) => arr.indexOf(a) === idx && a >= minAge && a <= maxAge)
    .sort((a, b) => a - b);

  const retX     = xS(retirementAge);
  const retPoint = trajectory.find(t => t.age === retirementAge);
  const endPoint = trajectory[trajectory.length - 1];
  const startPoint = trajectory[0];

  // Life events (years where any event fires)
  const eventPoints = trajectory.filter(t => t.eventTypes && t.eventTypes.length > 0);

  // Legend entries
  const legend = [
    { label: "Net worth", color: "var(--chart-networth)", dash: null, width: 2.5 },
    ...(hasSuper ? [{ label: "Super",    color: "#4472a8", dash: "3 2", width: 1.5 }] : []),
    ...(hasProp  ? [{ label: "Property", color: "#C2A06B", dash: "5 3", width: 1.5 }] : []),
    ...(hasLiq   ? [{ label: "Liquid",   color: "#9DB0A1", dash: "2 2", width: 1.5 }] : []),
  ];

  function handleMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const svgX = (px / rect.width) * W;
    const age = minAge + ((svgX - mg.left) / cW) * (maxAge - minAge);
    const clamped = Math.max(minAge, Math.min(maxAge, Math.round(age)));
    const pt = trajectory.find(t => t.age === clamped) || trajectory.reduce((a, b) => Math.abs(b.age - clamped) < Math.abs(a.age - clamped) ? b : a);
    setTooltip({ age: pt.age, nw: pt.netWorth, sup: pt.superBalance, liq: pt.liquidAssets, prop: pt.propertyValue, x: px, pct: px / rect.width });
  }

  return (
    <div style={{ background: "#FBFAF6", border: "1.5px solid #ECE7DB", borderRadius: 12, padding: "16px 16px 12px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 12 }}>
        Net Worth Trajectory
      </div>
      <div style={{ position: "relative" }} onMouseLeave={() => setTooltip(null)}>
      {tooltip && (
        <div style={{
          position: "absolute", top: 0, left: Math.min(tooltip.pct * 100, 70) + "%",
          pointerEvents: "none", zIndex: 10,
          background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)",
          borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "var(--tooltip-text)",
          boxShadow: "var(--tooltip-shadow)", whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Age {tooltip.age}</div>
          <div style={{ color: "var(--chart-networth)", fontFamily: "Spectral, serif", fontSize: 13 }}>Net worth: {fmt(tooltip.nw)}</div>
          {hasSuper && tooltip.sup > 0 && <div style={{ color: "#4472a8" }}>Super: {fmt(tooltip.sup)}</div>}
          {hasProp  && tooltip.prop > 0 && <div style={{ color: "#C2A06B" }}>Property: {fmt(tooltip.prop)}</div>}
          {hasLiq   && tooltip.liq > 0  && <div style={{ color: "#9DB0A1" }}>Liquid: {fmt(tooltip.liq)}</div>}
        </div>
      )}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} onMouseMove={handleMouseMove}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--chart-networth)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--chart-networth)" stopOpacity="0.00" />
          </linearGradient>
          <clipPath id="nwClip">
            <rect x={mg.left} y={mg.top - 5} width={cW} height={cH + 10} />
          </clipPath>
        </defs>

        {/* Grid + Y labels */}
        {yTicks.map(({ v, y }, i) => (
          <g key={i}>
            <line x1={mg.left} x2={W - mg.right} y1={y} y2={y}
              stroke={i === 0 ? "var(--chart-baseline)" : "var(--chart-gridline)"}
              strokeWidth={i === 0 ? 1.5 : 1} />
            <text x={mg.left - 6} y={y + 3.5} textAnchor="end" fontSize="9.5"
              fill="var(--chart-axis-label)">{fmt(v)}</text>
          </g>
        ))}

        {/* Retirement marker */}
        <line x1={retX} x2={retX} y1={mg.top} y2={mg.top + cH}
          stroke="var(--event-retire)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
        <text x={retX + 5} y={mg.top + 12} fontSize="9"
          fill="var(--event-retire)" opacity="0.65">Retire {retirementAge}</text>

        {/* Series paths */}
        <g clipPath="url(#nwClip)">
          <path d={nwAreaPath} fill="url(#nwGrad)" />
          {hasProp  && <path d={propPath}  fill="none" stroke="#C2A06B" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />}
          {hasSuper && <path d={superPath} fill="none" stroke="#4472a8" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"  />}
          {hasLiq   && <path d={liqPath}   fill="none" stroke="#9DB0A1" strokeWidth="1.5" strokeDasharray="2 2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"  />}
          <path d={nwPath} fill="none" stroke="var(--chart-networth)" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
          {/* Life event markers on the net worth line */}
          {eventPoints.map(t => (
            <circle key={t.age} cx={xS(t.age)} cy={yS(t.netWorth)} r="3.5"
              fill="var(--chart-goal-line)" stroke="white" strokeWidth="1.5" opacity="0.85" />
          ))}
        </g>

        {/* Key point dots */}
        <circle cx={xS(minAge)} cy={yS(startPoint.netWorth)} r="3.5"
          fill="var(--event-ring)" stroke="var(--chart-networth)" strokeWidth="2" />
        {retPoint && (
          <circle cx={retX} cy={yS(retPoint.netWorth)} r="4"
            fill="var(--event-retire)" stroke="var(--event-ring)" strokeWidth="2" />
        )}
        <circle cx={xS(maxAge)} cy={yS(endPoint.netWorth)} r="3.5"
          fill="var(--event-ring)" stroke="var(--chart-networth)" strokeWidth="2" />

        {/* X-axis age labels */}
        {xAxisAges.map(age => (
          <text key={age} x={xS(age)} y={H - 4} textAnchor="middle" fontSize="9"
            fill="var(--chart-axis-label)">
            {age === minAge || age === retirementAge || age === maxAge ? `Age ${age}` : age}
          </text>
        ))}

        {/* Hover cursor line */}
        {tooltip && (() => {
          const cx = xS(tooltip.age);
          const cy = yS(tooltip.nw);
          return (
            <g>
              <line x1={cx} x2={cx} y1={mg.top} y2={mg.top + cH}
                stroke="var(--chart-cursor)" strokeWidth="1" strokeDasharray="2 2" />
              <circle cx={cx} cy={cy} r="4" fill="var(--chart-networth)" stroke="white" strokeWidth="2" />
            </g>
          );
        })()}
      </svg>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 6, marginBottom: 8 }}>
        {legend.map(l => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6B6655" }}>
            <svg width="22" height="6" style={{ flexShrink: 0 }}>
              <line x1="0" y1="3" x2="22" y2="3"
                stroke={l.color} strokeWidth={l.width}
                strokeDasharray={l.dash || undefined} />
            </svg>
            {l.label}
          </span>
        ))}
        {eventPoints.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6B6655" }}>
            <svg width="10" height="10" style={{ flexShrink: 0 }}>
              <circle cx="5" cy="5" r="3.5" fill="var(--chart-goal-line)" stroke="white" strokeWidth="1.5" />
            </svg>
            Life event
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#8A8270", flexWrap: "wrap", borderTop: "1px solid #ECE7DB", paddingTop: 8 }}>
        <span>Today: <strong style={{ color: "#21241E", fontFamily: "Spectral, serif", fontSize: 13 }}>{currency(startPoint.netWorth)}</strong></span>
        {retPoint && (
          <span>At retirement: <strong style={{ color: "#21241E", fontFamily: "Spectral, serif", fontSize: 13 }}>{currency(retPoint.netWorth)}</strong></span>
        )}
        <span>Age {lifeExp}: <strong style={{ color: "#21241E", fontFamily: "Spectral, serif", fontSize: 13 }}>{currency(endPoint.netWorth)}</strong></span>
      </div>
    </div>
  );
}

// ─── SCENARIO COMPARISON ROW ──────────────────────────────────────────────────

function ScenarioComparisonRow({ data }) {
  const SCENS = [
    { key: "conservative", label: "Conservative", color: "#6B5830", bg: "#F5F0E8", bdr: "#e4d8bc" },
    { key: "base",         label: "Base",         color: "#2E4A3D", bg: "#EAF0EC", bdr: "#D8D2C4" },
    { key: "aggressive",   label: "Aggressive",   color: "#2a5480", bg: "#eaf0f8", bdr: "#b8cde0" },
  ];
  const assetTotals = deriveAssetTotals(data.assetItems);
  const engines = SCENS.map(({ key }) =>
    runEngine({ ...data, ...assetTotals, activeScenario: key, useCustomAssumptions: false })
  );
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 10 }}>
        Scenario Comparison
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {SCENS.map(({ key, label, color, bg, bdr }, idx) => {
          const eng = engines[idx];
          const mc  = eng.monteCarlo;
          const isActive = data.activeScenario === key && !data.useCustomAssumptions;
          return (
            <div key={key} style={{
              background: isActive ? bg : "#FBFAF6",
              border: `1.5px solid ${isActive ? bdr : "#ECE7DB"}`,
              borderRadius: 12, padding: "14px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                {isActive && (
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color, background: `${color}18`, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                  }}>Active</div>
                )}
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Super at retirement</div>
                <div style={{ fontSize: 17, fontFamily: "Spectral, serif", color: "#21241E" }}>
                  {currency(eng.metrics.projectedSuper)}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Net worth at retirement</div>
                <div style={{ fontSize: 17, fontFamily: "Spectral, serif", color: "#21241E" }}>
                  {currency(eng.metrics.retirementNetWorth)}
                </div>
              </div>
              {mc ? (
                <div>
                  <div style={{ fontSize: 9, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Probability of success</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 22, fontFamily: "Spectral, serif", color, lineHeight: 1 }}>{mc.successRate}%</span>
                    <div style={{ flex: 1, height: 5, background: "#ECE7DB", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${mc.successRate}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#9DB0A1", fontStyle: "italic" }}>Add retirement spending target for simulation</div>
              )}
              <div style={{ fontSize: 9, color: "#9DB0A1", marginTop: 10, borderTop: "1px solid #ECE7DB", paddingTop: 8 }}>
                {eng.assumptions.returnRate}% returns · {eng.assumptions.inflation}% inflation
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalysisSummary({ data, engine }) {
  const n = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const m           = engine?.metrics;
  const mort        = engine?.mortgage;
  const dd          = engine?.drawdown;
  const assumptions = engine?.assumptions;
  const mc   = engine?.monteCarlo;

  const couple = data.hasPartner === "yes";
  const firstName = data.firstName || "";
  const partnerFirstName = data.partnerName || "Partner";
  const possessive = firstName ? `${firstName}'s` : (couple ? "Your household's" : "Your");
  const scenarioLabel = { base: "Base", conservative: "Conservative", aggressive: "Aggressive" }[data.activeScenario || "base"];
  const retireAge = n(data.retirementAge) || 65;
  const lifeExp = n(data.lifeExpectancy) || 90;

  const aT = deriveAssetTotals(data.assetItems || []);
  const liquidTotal = aT.cashSavings + aT.sharesEtfs + aT.managedFunds + aT.crypto + aT.otherInvestments;
  const allIPs = data.investmentProperties || [];
  const totalAssets = [aT.cashSavings, aT.sharesEtfs, aT.managedFunds, aT.crypto, aT.otherInvestments,
    n(data.superBalance), couple ? n(data.partnerSuperBalance) : 0, n(data.ppOrValue),
    ...allIPs.map(ip => n(ip.value))].reduce((s, v) => s + v, 0);
  const totalDebts = [n(data.mortgageBalance), n(data.creditCardDebt), n(data.personalLoanDebt), n(data.hecsDebt),
    couple ? n(data.partnerCreditCardDebt) : 0,
    couple ? n(data.partnerPersonalLoanDebt) : 0,
    couple ? n(data.partnerHecsDebt) : 0,
    ...allIPs.map(ip => n(ip.mortgageBalance))].reduce((s, v) => s + v, 0);
  const netWorth = totalAssets - totalDebts;

  const netMonthly = estimateNetMonthly(data);
  const budgetItems = data.budgetItems || [];
  const totalExpenses = budgetTotal(budgetItems) || n(data.monthlyExpenses);
  const savings = n(data.savingsPerMonth);
  const otherMonthly = (n(data.annualIrregular) + n(data.insuranceAnnualPremium)) / 12;
  const monthlySurplus = netMonthly - totalExpenses - savings - otherMonthly;
  const calRows = budgetItems.length > 0 && netMonthly > 0
    ? buildCashflowCalendar(budgetItems, netMonthly, aT.cashSavings) : [];
  const tightMonths = calRows.filter(r => r.net < 0 || (r.annual > 0 && r.net < netMonthly * 0.3));

  const hasSuperData = n(data.superBalance) > 0 && n(data.grossIncome) > 0;
  const baseSpend = n(data.targetRetirementSpending);
  const goals = data.goals || [];
  const additiveGoalAmt = goalAnnualAdditive(goals);
  const effectiveSpend = baseSpend + additiveGoalAmt;
  const hasTarget = effectiveSpend > 0;
  const sgContrib = n(data.grossIncome) * ((n(data.employerSgRate) || 12) / 100);
  const concCapHeadroom = Math.max(0, 30000 - sgContrib - n(data.salarySacrifice));

  const hasMortgage = n(data.mortgageBalance) > 0;
  const hasHecs = n(data.hecsDebt) > 0;
  const hasCreditCard = n(data.creditCardDebt) > 0;
  const hasPersonalLoan = n(data.personalLoanDebt) > 0;
  const existingIPs = allIPs.filter(ip => ip.status === "existing");

  const sections = [];

  // ── 1. Position ──
  if (totalAssets > 0 || netMonthly > 0) {
    const parts = [];
    let pos = `${possessive} net worth currently stands at ${currency(netWorth)}`;
    if (liquidTotal > 0) pos += `, with ${currency(liquidTotal)} in liquid savings and investments`;
    if (n(data.superBalance) > 0) {
      const combinedNote = couple && n(data.partnerSuperBalance) > 0
        ? ` (${currency(n(data.superBalance) + n(data.partnerSuperBalance))} combined)` : "";
      pos += ` and ${currency(n(data.superBalance))} in super${combinedNote}`;
    }
    parts.push(pos + ".");
    if (hasSuperData && m) {
      parts.push(m.onTrack
        ? `Under the ${scenarioLabel} scenario, super is projected to reach ${currency(m.projectedSuper)} at age ${retireAge} — ${currency(m.superSurplus)} ahead of the modelled retirement target.`
        : `Under the ${scenarioLabel} scenario, super is projected to reach ${currency(m.projectedSuper)} at age ${retireAge} — ${currency(Math.abs(m.superSurplus))} below what's needed to fund the retirement spending target entered.`);
    }
    sections.push({ title: "Financial position", color: "#2E4A3D", text: parts.join(" ") });
  }

  // ── 2. Income & cashflow ──
  if (netMonthly > 0) {
    const parts = [];
    let cf = `Estimated take-home income is ${currency(netMonthly)}/month after FY2026-27 tax${couple ? " across both incomes" : ""}.`;
    if (totalExpenses > 0) {
      const totalSpending = totalExpenses + otherMonthly;
      const surplusText = monthlySurplus >= 0
        ? `a ${currency(monthlySurplus)}/month surplus` : `a ${currency(Math.abs(monthlySurplus))}/month shortfall`;
      cf += ` After ${currency(totalSpending)}/month in spending${savings > 0 ? ` and ${currency(savings)}/month in savings` : ""}, the budget runs ${surplusText}.`;
    }
    parts.push(cf);
    if (tightMonths.length > 0) {
      parts.push(`Watch ${tightMonths.map(r => r.short).join(", ")} — ${tightMonths.length === 1 ? "that month sees" : "those months see"} lump-sum expenses that tighten cashflow against the monthly run-rate.`);
    }
    sections.push({ title: "Income & cashflow", color: "#2a5480", text: parts.join(" ") });
  }

  // ── 2b. Tax breakdown ──
  const ht = engine?.householdTax;
  if (ht && ht.totalHouseholdTax > 0) {
    const parts = [];
    const p1 = ht.person1;
    const p2 = ht.person2;
    let taxLine = couple && p2
      ? `${firstName || "You"} pays ${currency(p1.totalTax)}/yr tax (${Math.round(p1.effectiveRate * 100)}% effective) on ${currency(p1.taxableIncome)} taxable income; ${partnerFirstName} pays ${currency(p2.totalTax)}/yr (${Math.round(p2.effectiveRate * 100)}%) on ${currency(p2.taxableIncome)}.`
      : `Estimated income tax is ${currency(p1.totalTax)}/year — ${Math.round(p1.effectiveRate * 100)}% effective rate on ${currency(p1.taxableIncome)} taxable income.`;
    parts.push(taxLine);
    if (p1.mls > 0 || (p2?.mls ?? 0) > 0) {
      const mlsAmount = p1.mls + (p2?.mls ?? 0);
      parts.push(`Medicare Levy Surcharge of ${currency(mlsAmount)}/yr applies due to no hospital-level private health cover — taking out hospital cover could eliminate this charge.`);
    }
    if (p1.hecsRepayment > 0 || (p2?.hecsRepayment ?? 0) > 0) {
      parts.push(`HECS-HELP compulsory repayments total ${currency(p1.hecsRepayment + (p2?.hecsRepayment ?? 0))}/yr, deducted automatically via the tax system.`);
    }
    if (p1.division293 > 0 || (p2?.division293 ?? 0) > 0) {
      parts.push(`Division 293 tax of ${currency(p1.division293 + (p2?.division293 ?? 0))}/yr applies — income plus super contributions exceed $250k.`);
    }
    if (ht.negativeGearingBenefit > 0) {
      parts.push(`Negative gearing on investment property reduces household tax by ${currency(ht.negativeGearingBenefit)}/yr.`);
    }
    sections.push({ title: "Income tax breakdown", color: "#4a4870", text: parts.join(" ") });
  }

  // ── 3. Super & retirement ──
  if (hasSuperData) {
    const parts = [];
    if (hasTarget && dd) {
      const inf          = assumptions?.inflation ?? 2.5;
      const yearsToRetire = Math.max(retireAge - (n(data.age) || 0), 0);
      const inflationNote = yearsToRetire > 0
        ? `, inflated at ${inf}% p.a. over ${yearsToRetire} ${yearsToRetire === 1 ? "year" : "years"}`
        : "";
      const spendSentence = additiveGoalAmt > 0
        ? `Targeting retirement from age ${retireAge}, spending ${currency(dd.futureSpending)}/year — ${currency(baseSpend)}/year base target plus ${currency(additiveGoalAmt)}/year in additional goal spending (in today's dollars${inflationNote}).`
        : `Targeting retirement from age ${retireAge}, spending ${currency(dd.futureSpending)}/year (${currency(baseSpend)}/year in today's dollars${inflationNote}).`;
      parts.push(spendSentence);
      if (m?.lastsToLifeExpectancy) {
        parts.push(`Projected super of ${currency(m.projectedSuper)} is sufficient to fund spending all the way to age ${lifeExp} — the full life expectancy modelled.`);
      } else if (m?.depletionAge) {
        parts.push(`This scenario projects super of ${currency(m.projectedSuper)} exhausted at age ${m.depletionAge} — ${m.depletionAge - retireAge} years into retirement. The modelled gap is ${currency(Math.abs(m?.superSurplus || 0))}. Adjusting the scenario assumptions, contributions, or spending target will change this outcome.`);
      }
      if (mc) {
        const confidence = mc.successRate >= 85 ? "a strong result" : mc.successRate >= 70 ? "a zone worth monitoring" : "an area that needs attention";
        parts.push(`Across 1,000 simulations, there's a ${mc.successRate}% probability of funding retirement fully to age ${lifeExp} — ${confidence}.`);
      }
    } else {
      const combinedNote = couple && n(data.partnerSuperBalance) > 0
        ? ` (${currency(n(data.superBalance) + n(data.partnerSuperBalance))} combined)` : "";
      parts.push(`Current super of ${currency(n(data.superBalance))}${combinedNote} is projected to reach ${currency(m?.projectedSuper || 0)} by age ${retireAge}. Enter a retirement spending target in the Super & Goals stage to unlock the full funded-to-age and Monte Carlo analysis.`);
    }
    if (concCapHeadroom > 5000) {
      parts.push(`${currency(Math.round(concCapHeadroom))} of concessional contribution capacity remains unused this year — salary sacrifice within this limit reduces taxable income and compounds inside super's lower tax environment.`);
    }
    // Age Pension
    const ap = engine?.agePension;
    if (ap) {
      if (ap.eligible && ap.estimatedAnnual > 0) {
        parts.push(`Based on projected assets at retirement, there may be partial Age Pension eligibility of approximately ${currency(ap.estimatedAnnual)}/yr — primarily limited by the ${ap.limitingTest === "assets" ? "assets test" : "income test"}. This is illustrative only; actual entitlement requires Services Australia assessment.`);
      } else if (retireAge < 67) {
        parts.push(`Age Pension becomes available from age 67 — a ${67 - retireAge}-year gap from planned retirement at ${retireAge} needs to be bridged by super and other savings.`);
      }
    }
    if (m?.capExceeded) {
      parts.push(`Projected super of ${currency(m.projectedSuper)} exceeds the Transfer Balance Cap ($1.9M) — the excess stays in accumulation phase (earnings taxed at 15%). Pension-phase structuring above the Transfer Balance Cap is a specialist area — an AFSL-licensed adviser can model strategies specific to your circumstances.`);
    }
    sections.push({ title: "Superannuation & retirement", color: "#5a7840", text: parts.join(" ") });
  }

  // ── 4. Property & debt ──
  if (hasMortgage || hasHecs || hasCreditCard || hasPersonalLoan || existingIPs.length > 0) {
    const parts = [];
    if (hasMortgage && mort) {
      parts.push(mort.type === "io"
        ? mort.ioExpiryYear
          ? `The PPOR mortgage of ${currency(n(data.mortgageBalance))} is interest-only until ${mort.ioExpiryYear}, then reverts to P&I at ${currency(mort.piMonthlyPayment)}/month until ${mort.loanEndYear}.`
          : `The PPOR mortgage of ${currency(n(data.mortgageBalance))} is interest-only — the principal doesn't reduce and will need to be managed before or at maturity.`
        : mort.debtFreeYear
          ? `The PPOR mortgage of ${currency(n(data.mortgageBalance))} is on track to be cleared by ${mort.debtFreeYear} (${mort.yearsToPayoff} years remaining at ${currency(mort.monthlyPayment)}/month), freeing up meaningful cashflow once gone.`
          : `Mortgage of ${currency(n(data.mortgageBalance))} is recorded.`);
    }
    existingIPs.forEach(ip => {
      const cf = engine?.propertyCashflows?.find(c => c.id === ip.id);
      if (cf) parts.push(`${ip.label || "Investment property"} is ${cf.isNegativelyGeared ? "negatively geared" : "positively geared"}, generating ${currency(cf.netCashflow)}/year net cashflow.`);
    });
    const otherDebts = [
      hasCreditCard && `credit card (${currency(n(data.creditCardDebt))})`,
      hasPersonalLoan && `personal loan (${currency(n(data.personalLoanDebt))})`,
      hasHecs && `HECS-HELP (${currency(n(data.hecsDebt))}, repaid automatically via the tax system)`,
    ].filter(Boolean);
    if (otherDebts.length > 0) parts.push(`Other obligations on record: ${otherDebts.join(", ")}.`);
    if (parts.length > 0) sections.push({ title: "Property & debt", color: "#7a5040", text: parts.join(" ") });
  }

  // ── 5. Goals — rendered separately below as JSX (not in sections[]) ──

  // ── Adviser discussion points ──
  const adviserPoints = [];
  if (hasSuperData && concCapHeadroom > 5000)
    adviserPoints.push(`Salary sacrifice and concessional contributions — ${currency(Math.round(concCapHeadroom))} of unused cap this year`);
  if (hasSuperData && m && !m.onTrack && hasTarget)
    adviserPoints.push(`Strategies to close the ${currency(Math.abs(m.superSurplus))} retirement gap — contributions timing, retirement age, or spending adjustments`);
  if (engine?.householdTax?.person1?.mls > 0 || engine?.householdTax?.person2?.mls > 0)
    adviserPoints.push("Medicare Levy Surcharge — taking out hospital-level private health cover would eliminate this charge and may be cost-effective");
  if (engine?.householdTax?.person1?.division293 > 0 || engine?.householdTax?.person2?.division293 > 0)
    adviserPoints.push("Division 293 tax — salary packaging strategies and super fund payment options for this high-income super tax");
  if (hasMortgage && mort?.type === "pi")
    adviserPoints.push("Offset account vs extra repayments vs investing the surplus — the right call depends on your mortgage rate vs expected after-tax returns");
  if (hasMortgage && mort?.type === "io")
    adviserPoints.push(mort.ioExpiryYear
      ? `Interest-only expiry in ${mort.ioExpiryYear} — plan for the payment step-up to ${currency(mort.piMonthlyPayment)}/month and whether to refinance or pay down principal before then`
      : "Interest-only exit strategy — how to manage the transition when the IO period ends");
  if (hasCreditCard || hasPersonalLoan)
    adviserPoints.push("High-interest debt elimination — repaying credit cards and personal loans typically beats investing the same money");
  if (hasHecs)
    adviserPoints.push("HECS-HELP voluntary repayment — there's no interest charged, so it's rarely the priority, but it does affect borrowing capacity");
  if (existingIPs.length > 0)
    adviserPoints.push("Investment property tax position — depreciation schedule, negative gearing benefits, and CGT implications on eventual sale");
  if (engine?.agePension?.estimatedAnnual > 0)
    adviserPoints.push(`Age Pension strategies — assets test and income test thresholds, and how to structure drawdown to maximise the estimated ${currency(engine.agePension.estimatedAnnual)}/yr entitlement`);
  if (m?.capExceeded)
    adviserPoints.push("Transfer Balance Cap management — pension-phase drawdown structuring and super fund strategy above the $1.9M cap");
  if (n(data.superBalance) > 0)
    adviserPoints.push("Insurance review — life and income protection coverage inside and outside of super");
  adviserPoints.push("Estate planning — will, super beneficiary nominations, and enduring power of attorney");

  const SectionBlock = ({ title, color, text }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        color, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${color}30`,
      }}>{title}</div>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: "#21241E", margin: 0 }}>{text}</p>
    </div>
  );

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{
        background: "#EAF0EC", border: "1px solid #D8D2C4", borderRadius: 12,
        padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, background: "#2E4A3D", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Spectral, serif", fontSize: 17, color: "white", flexShrink: 0,
        }}>C</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#2E4A3D", marginBottom: 1 }}>Clearpath Summary</div>
          <div style={{ fontSize: 11, color: "#8A8270" }}>
            {firstName ? `Prepared for ${firstName}` : "Your financial picture"} · {scenarioLabel} scenario · General information only
          </div>
        </div>
      </div>

      {sections.map(s => <SectionBlock key={s.title} {...s} />)}

      {goals.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "#6b5040", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #6b504030",
          }}>Goals on your radar</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {goals.map(g => {
              const amt = parseFloat(String(g.amount || "").replace(/,/g, "")) || 0;
              const freqLabel = { monthly: "/month", quarterly: "/quarter", annual: "/year" }[g.frequency] || "/year";
              return (
                <div key={g.key} style={{
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "8px 12px", background: "#FBFAF6", borderRadius: 8, border: "1px solid #ECE7DB",
                }}>
                  <div style={{ flex: 1, fontSize: 13, color: "#21241E", minWidth: 160 }}>{g.label}</div>
                  {amt > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#2E4A3D", whiteSpace: "nowrap" }}>
                      {currency(amt)}{freqLabel}
                    </div>
                  )}
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                    color: g.additive ? "#2a5480" : "#6B6655",
                    background: g.additive ? "#eaf0f8" : "#F5F2EB",
                    padding: "3px 8px", borderRadius: 10, whiteSpace: "nowrap",
                  }}>
                    {g.additive ? "+ Additional" : "Included in target"}
                  </div>
                </div>
              );
            })}
          </div>
          {additiveGoalAmt > 0 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#2a5480", lineHeight: 1.5, padding: "8px 12px", background: "#eaf0f8", borderRadius: 8 }}>
              {currency(additiveGoalAmt)}/year in additional goal spending is included in the retirement projections above.
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: "#8A8270", lineHeight: 1.5 }}>
              No goals are currently marked as additional to your retirement target. Tick "in addition to" on any goal in Stage 6 to include its cost in the projections.
            </div>
          )}
        </div>
      )}

      {adviserPoints.length > 0 && (
        <div style={{ background: "#F5F2EB", border: "1px solid #ECE7DB", borderRadius: 12, padding: "18px 18px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6655", marginBottom: 12 }}>
            Topics to discuss with your adviser
          </div>
          {adviserPoints.map((pt, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ color: "#2E4A3D", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 2 }}>→</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "#6B6655" }}>{pt}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #ECE7DB", fontSize: 11, color: "#8A8270", lineHeight: 1.5 }}>
            The above are topics for discussion only. Nothing in this summary constitutes personal financial advice. For tailored recommendations, engage a licensed Australian financial adviser (AFSL holder).
          </div>
        </div>
      )}
    </div>
  );
}

// Build single-person data slice for individual analysis view
function derivePersonData(data, person) {
  const pf = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

  if (person === "primary") {
    return {
      ...data, hasPartner: "no",
      partnerIncome: "", partnerBonusIncome: "", partnerOtherIncome: "",
      partnerSuperBalance: "", partnerSalarySacrifice: "0", partnerEmployerSgRate: "12",
    };
  }
  if (person === "partner") {
    return {
      ...data, hasPartner: "no",
      firstName: data.partnerName || "Partner",
      age: data.partnerAge || data.age,
      retirementAge: data.partnerRetirementAge || data.retirementAge,
      grossIncome: data.partnerIncome || "",
      bonusIncome: data.partnerBonusIncome || "",
      otherIncome: data.partnerOtherIncome || "",
      superBalance: data.partnerSuperBalance || "",
      employerSgRate: data.partnerEmployerSgRate || "12",
      salarySacrifice: data.partnerSalarySacrifice || "0",
      salarySacrificeMaxed: !!data.partnerSalarySacrificeMaxed,
      privateHealthInsurance: data.partnerPrivateHealthInsurance || "yes",
      hecsDebt: data.partnerHecsDebt || "",
      creditCardDebt: data.partnerCreditCardDebt || "",
      personalLoanDebt: data.partnerPersonalLoanDebt || "",
      partnerIncome: "", partnerBonusIncome: "", partnerOtherIncome: "",
      partnerSuperBalance: "", partnerSalarySacrifice: "0", partnerEmployerSgRate: "12",
      partnerRetirementAge: "", partnerAge: "",
    };
  }
  return data; // combined
}

// Apply maxed salary sacrifice to data before engine run
function applyMaxedSS(data) {
  const pf = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const gross1 = pf(data.grossIncome) + pf(data.bonusIncome) + pf(data.otherIncome);
  const sg1 = gross1 * ((pf(data.employerSgRate) || 12) / 100);
  const effectiveSS1 = data.salarySacrificeMaxed
    ? String(Math.round(Math.max(0, 30000 - sg1)))
    : (data.salarySacrifice || "0");

  const isCouple = data.hasPartner === "yes";
  const gross2 = isCouple ? pf(data.partnerIncome) + pf(data.partnerBonusIncome) + pf(data.partnerOtherIncome) : 0;
  const sg2 = gross2 * ((pf(data.partnerEmployerSgRate) || 12) / 100);
  const effectiveSS2 = isCouple && data.partnerSalarySacrificeMaxed
    ? String(Math.round(Math.max(0, 30000 - sg2)))
    : (data.partnerSalarySacrifice || "0");

  return { ...data, salarySacrifice: effectiveSS1, partnerSalarySacrifice: effectiveSS2 };
}

function AssumptionsRegister({ engine, data }) {
  const [open, setOpen] = useState(false);
  const ht = engine?.householdTax;
  const assumptions = engine?.assumptions || {};
  const pf = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
  const fmt = n => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const sections = [
    {
      title: "Market & returns",
      rows: [
        { label: "Investment return", value: `${assumptions.returnRate ?? 6.5}% p.a.`, source: "Vanguard Index Chart (30-yr diversified average); RBA long-run real rate + inflation" },
        { label: "Inflation", value: `${assumptions.inflation ?? 2.5}% p.a.`, source: "RBA target band 2–3%; mid-point used" },
        { label: "Property growth (PPOR & IP)", value: `${assumptions.propertyGrowth ?? 4.5}% p.a.`, source: "CoreLogic long-run national dwelling value growth" },
        { label: "Rental yield", value: `${assumptions.rentalYield ?? 3.0}% p.a.`, source: "CoreLogic gross rental yield national average" },
        { label: "Safe withdrawal rate", value: `${assumptions.swr ?? 4.0}%`, source: "Bengen (1994); widely adopted in AU retirement research (ASFA)" },
      ],
    },
    {
      title: "Tax — FY2026–27",
      rows: [
        { label: "Tax brackets", value: "0% / 15% / 30% / 37% / 45%", source: "ATO Individual Income Tax Rates FY2026-27 (Stage 3 cuts in effect)" },
        { label: "Medicare Levy", value: "2.0%", source: "ITAA 1936 s251R; standard levy rate" },
        { label: "Low Income Tax Offset (LITO)", value: "Up to $700", source: "ATO LITO; phased out $37,500–$66,667" },
        { label: "CGT discount", value: "50% (if held >12 months)", source: "ITAA 1997 s115-100" },
        { label: "Franking credit refundability", value: "Excess refunded by ATO", source: "Income Tax Assessment Act 1997 s207-45 (post-2001 rule)" },
        { label: "CGT marginal rate (IP sale estimate)", value: "30%", source: "Middle bracket estimate; actual rate depends on income in sale year" },
      ],
    },
    {
      title: "Superannuation",
      rows: [
        { label: "Concessional cap", value: "$30,000/yr", source: "Treasury Laws Amendment (Better Targeted Super) Act 2023; FY2024-25 onward" },
        { label: "Contributions tax", value: "15%", source: "ITAA 1997 s295-190" },
        { label: "Preservation age", value: "60", source: "SIS Regulations r6.01(2)" },
        { label: "Transfer Balance Cap", value: "$1,900,000", source: "ATO TBC for FY2025-26; indexed to CPI" },
        { label: "Carry-forward eligibility threshold", value: "Prior 30 June super balance < $500,000", source: "Treasury Laws Amendment 2018; Schedule 2" },
        { label: "SG rate", value: "12%", source: "SGAA 1992 s19; legislated rate from 1 July 2025" },
      ],
    },
    {
      title: "Age Pension",
      rows: [
        { label: "Eligibility age", value: "67", source: "Social Security Act 1991 s23(5A); raised progressively from 65" },
        { label: "Single rate (full pension)", value: "$28,514/yr", source: "DSS rates effective 20 March 2025" },
        { label: "Couple rate (combined)", value: "$43,022/yr", source: "DSS rates effective 20 March 2025" },
        { label: "Assets taper", value: "$78 per $1,000 above threshold", source: "Social Security Act 1991 s1131; taper rate" },
        { label: "Income taper", value: "50c per $1 above free area", source: "Social Security Act 1991 s1073" },
      ],
    },
    {
      title: "Monte Carlo simulation",
      rows: [
        { label: "Iterations", value: "1,000", source: "Standard financial planning practice; balances accuracy vs performance" },
        { label: "Return volatility — Base", value: "±10%", source: "Approximate annual standard deviation for a 60/40 diversified portfolio" },
        { label: "Return volatility — Conservative", value: "±8%", source: "Defensive allocation (higher bonds); lower variance" },
        { label: "Return volatility — Aggressive", value: "±14%", source: "Growth tilt (higher equities); higher variance" },
        { label: "Success threshold", value: "Funds last to life expectancy", source: "Standard definition used across modelling tools" },
      ],
    },
  ];

  return (
    <div style={{ marginTop: 24, border: "1.5px solid #D8D2C4", borderRadius: 12, overflow: "hidden", background: "#FBFAF6" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "14px 18px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: "none", border: "none",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15 }}>📋</span>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#21241E" }}>Assumptions register</div>
            <div style={{ fontSize: 11, color: "#8A8270" }}>All modelling assumptions with source citations</div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#8A8270", transform: open ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 0.2s" }}>▼</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid #ECE7DB", padding: "16px 18px" }}>
          {sections.map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6655", marginBottom: 8 }}>
                {section.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #ECE7DB" }}>
                {section.rows.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 0, background: i % 2 === 0 ? "white" : "#F5F2EB" }}>
                    <div style={{ padding: "7px 10px", fontSize: 12, fontWeight: 500, color: "#21241E", borderRight: "1px solid #ECE7DB" }}>{row.label}</div>
                    <div style={{ padding: "7px 10px", fontSize: 12, color: "#2E4A3D", fontWeight: 600, borderRight: "1px solid #ECE7DB", fontFamily: "'Spectral', serif" }}>{row.value}</div>
                    <div style={{ padding: "7px 10px", fontSize: 11, color: "#8A8270", lineHeight: 1.4 }}>{row.source}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#8A8270", lineHeight: 1.5, marginTop: 4, paddingTop: 12, borderTop: "1px solid #ECE7DB" }}>
            Assumptions are reviewed periodically. Projections are illustrative — actual outcomes will differ. This is general information only and does not constitute financial advice.
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisScreen({ data, set }) {
  const [expandedKey, setExpandedKey] = useState(data.activeScenario || "base");
  const [viewPerson, setViewPerson] = useState("combined");

  const isCouple = data.hasPartner === "yes" && (data.partnerIncome || data.partnerSuperBalance || data.partnerAge);
  const aT = deriveAssetTotals(data.assetItems);
  const baseSpend = parseFloat(String(data.targetRetirementSpending || "").replace(/,/g, "")) || 0;
  const additiveGoals = goalAnnualAdditive(data.goals);
  const effectiveSpend = baseSpend + additiveGoals;

  // Apply person view and maxed SS, then run engine
  const personData = derivePersonData(data, viewPerson);
  const ssData = applyMaxedSS(personData);
  const derivedData = {
    ...ssData, ...aT,
    targetRetirementSpending: effectiveSpend > 0 ? String(effectiveSpend) : data.targetRetirementSpending,
  };
  const engine = runEngine(derivedData);

  function handleScenarioToggle(key) {
    if (data.activeScenario !== key) {
      set("activeScenario", key);
      setExpandedKey(key);
    } else {
      setExpandedKey(prev => prev === key ? null : key);
    }
  }

  return (
    <div>
      {/* ── Planning scenario ── */}
      <SectionDivider label="Planning scenario & assumptions" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6B6655" }}>
          Model different market conditions — conservative stress-tests a poor return sequence, aggressive models strong growth.
        </div>
        <button
          onClick={() => set("useCustomAssumptions", !data.useCustomAssumptions)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
            border: "1.5px solid", borderColor: data.useCustomAssumptions ? "#2E4A3D" : "#D8D2C4",
            borderRadius: 20, background: data.useCustomAssumptions ? "#EAF0EC" : "white",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            color: data.useCustomAssumptions ? "#2E4A3D" : "#6B6655", flexShrink: 0, marginLeft: 12,
          }}
        >
          <div style={{
            width: 32, height: 18, borderRadius: 9, background: data.useCustomAssumptions ? "#2E4A3D" : "#D8D2C4",
            position: "relative", transition: "background 0.2s",
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%", background: "white",
              position: "absolute", top: 2, left: data.useCustomAssumptions ? 16 : 2,
              transition: "left 0.2s",
            }} />
          </div>
          {data.useCustomAssumptions ? "Custom on" : "Default"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {[
          { key: "base", label: "Base — most likely case" },
          { key: "conservative", label: "Conservative — stress test" },
          { key: "aggressive", label: "Aggressive — upside case" },
        ].map(s => (
          <ScenarioPanel
            key={s.key}
            scenarioKey={s.key}
            label={s.label}
            data={data}
            set={set}
            isActive={data.activeScenario === s.key}
            isExpanded={expandedKey === s.key}
            onToggle={() => handleScenarioToggle(s.key)}
            isCustom={!!data.useCustomAssumptions}
          />
        ))}
      </div>

      {/* ── Per-person view toggle (couples only) ── */}
      {isCouple && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8270", marginBottom: 8 }}>
            View
          </div>
          <div style={{ display: "flex", background: "#F5F2EB", borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              { key: "primary",  label: data.firstName || "You" },
              { key: "partner",  label: data.partnerName || "Partner" },
              { key: "combined", label: "Combined" },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setViewPerson(opt.key)}
                style={{
                  flex: 1, padding: "7px 10px", border: "none", borderRadius: 8,
                  background: viewPerson === opt.key ? "#2E4A3D" : "transparent",
                  color: viewPerson === opt.key ? "white" : "#6B6655",
                  fontSize: 12, fontWeight: viewPerson === opt.key ? 600 : 400,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}
              >{opt.label}</button>
            ))}
          </div>
          {viewPerson !== "combined" && (
            <div style={{ fontSize: 11, color: "#8A8270", marginTop: 6 }}>
              Showing individual projection for {viewPerson === "primary" ? (data.firstName || "you") : (data.partnerName || "partner")}. Shared assets (property, investments) are included in full.
            </div>
          )}
        </div>
      )}

      <WarningsPanel data={derivedData} engine={engine} />
      <MetricsRow engine={engine} data={derivedData} />
      <MonteCarloCard data={derivedData} engine={engine} />
      <FIREPanel engine={engine} data={derivedData} />
      <NetWorthChart engine={engine} data={derivedData} />
      <ProjectionTable engine={engine} data={derivedData} />
      <ScenarioComparisonRow data={derivedData} />
      {(data.budgetItems || []).length > 0 && (() => {
        const netMo = estimateNetMonthly(data);
        const startCash = deriveAssetTotals(data.assetItems).cashSavings;
        return netMo > 0
          ? <CashflowCalendar items={data.budgetItems} netMonthly={netMo} startingCash={startCash} />
          : null;
      })()}
      <AnalysisSummary data={derivedData} engine={engine} />
      <AssumptionsRegister engine={engine} data={derivedData} />
      <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <button onClick={() => window.print()} style={{
          padding: "10px 20px", border: "none", borderRadius: 10,
          background: "#C2A06B", color: "#2A2113", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Print / Save PDF</button>
      </div>
    </div>
  );
}

// ─── ACTION PLAN SCREEN ───────────────────────────────────────────────────────

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
  const aT = deriveAssetTotals(data.assetItems);
  const ssData = applyMaxedSS({ ...data, ...aT });
  const derivedData = { ...ssData, ...aT };
  const engine = runEngine(derivedData);
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
              <div style={{ fontSize: 10, color: "#8A8270", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontFamily: "Spectral, serif", fontSize: 18, color: "#2E4A3D", fontWeight: 500 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#8A8270", lineHeight: 1.6, background: "#F5F2EB", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
        The observations below are derived from your inputs and the modelling engine. They present calculations and factual notes — not personal financial advice. For decisions affecting your financial position, consult a licensed Australian financial adviser (AFSL holder).
      </div>

      {Object.entries(PLAN_CATEGORIES).map(([key, cat]) => {
        const catItems = grouped[key] || [];
        if (catItems.length === 0) return null;
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{cat.icon}</span>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#6B6655" }}>
                {cat.label}
              </div>
            </div>
            {catItems.map(item => <PlanItem key={item.id} item={item} />)}
          </div>
        );
      })}

      <div style={{ marginTop: 8, background: "#F5F2EB", border: "1px solid #ECE7DB", borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6B6655", marginBottom: 10 }}>
          Topics to explore with a financial adviser
        </div>
        {[
          "Super contribution strategies, including salary sacrifice, carry-forward, and spouse contributions",
          "Insurance — life, income protection, TPD, and trauma cover inside and outside super",
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

      <div className="no-print" style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <button onClick={() => window.print()} style={{
          padding: "10px 20px", border: "none", borderRadius: 10,
          background: "#C2A06B", color: "#2A2113", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>Print / Save PDF</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function ClearpathMVP() {
  const [data, setData] = useState(() => loadData());
  const [stage, setStage] = useState(() => loadStage());
  const scrollRef = useRef(null);

  function set(field, value) {
    setData(prev => {
      const next = { ...prev, [field]: value };
      saveData(next);
      return next;
    });
  }

  function setMany(updates) {
    setData(prev => {
      const next = { ...prev, ...updates };
      saveData(next);
      return next;
    });
  }

  function goTo(s) {
    setStage(s);
    saveStage(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 50);
  }

  function next() { goTo(Math.min(stage + 1, 7)); }
  function back() { goTo(Math.max(stage - 1, 1)); }

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
}`}</style>

      <header className="no-print" style={{ background: "#FBFAF6", borderBottom: "1px solid #ECE7DB", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontFamily: "Spectral, serif", fontSize: 20, color: "#21241E" }}>
            Clear<span style={{ color: "#2E4A3D" }}>path</span>
          </div>
          <div className="app-subtitle" style={{ fontSize: 10, color: "#8A8270", letterSpacing: "0.08em", textTransform: "uppercase" }}>Personal Financial Modelling & Scenario Planning</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {data.firstName && <div style={{ fontSize: 12, color: "#6B6655" }}>Hi, {data.firstName} 👋</div>}
          <button
            onClick={() => { if (window.confirm("Clear all saved data?")) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem("clearpath_stage"); setData({ ...EMPTY_DATA }); setStage(1); } }}
            style={{ fontSize: 11, color: "#8A8270", background: "none", border: "1px solid #ECE7DB", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >Clear data</button>
        </div>
      </header>

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
            {stage === 6 && <AnalysisScreen data={data} set={set} />}
            {stage === 7 && <ActionPlanScreen data={data} />}
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
          <strong style={{ color: "#6B6655" }}>General information only.</strong> Clearpath is an educational planning tool and does not provide personal financial advice. All projections and analysis are illustrative estimates based on the information you enter. Before making financial decisions, consider seeking advice from a licensed Australian financial adviser (AFSL holder). Past performance is not a reliable indicator of future performance.
        </div>
      </footer>
    </div>
  );
}
