import { useState, useRef } from "react";
import { DEFAULT_SCENARIOS, getActiveAssumptions, runEngine, propertyAnnualCashflow, runMonteCarlo } from "./engine.js";
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
    source: "The 4% rule originates from the Bengen (1994) study and is widely referenced in Australian financial planning. ASFA and Vanguard research suggests 3.5–4.5% is a reasonable sustainable drawdown rate for a 25–30 year retirement, depending on portfolio composition.",
  },
};

const STAGES = [
  { id: 1, label: "Profile",  icon: "👤", title: "Household Profile",      subtitle: "Let's start with the basics" },
  { id: 2, label: "Income",   icon: "💰", title: "Income & Cashflow",       subtitle: "Your earnings and spending" },
  { id: 3, label: "Assets",   icon: "🏦", title: "Assets & Savings",        subtitle: "What you own and hold" },
  { id: 4, label: "Property", icon: "🏠", title: "Property & Debt",         subtitle: "Leverage and obligations" },
  { id: 5, label: "Super",     icon: "📈", title: "Super & Goals",            subtitle: "Retirement engine and priorities" },
  { id: 6, label: "Scenarios", icon: "🎯", title: "Scenarios",               subtitle: "Planning assumptions" },
  { id: 7, label: "Analysis", icon: "✦",  title: "Your Financial Picture",  subtitle: "Financial summary & discussion points" },
];


const EMPTY_DATA = {
  // Stage 1
  firstName: "", age: "", partnerAge: "", partnerRetirementAge: "", hasPartner: "no",
  dependants: "0", location: "", employmentStatus: "full-time",
  retirementAge: "65", lifeExpectancy: "90", homeOwnership: "owner",
  // Stage 2
  grossIncome: "", partnerIncome: "", bonusIncome: "", otherIncome: "",
  monthlyExpenses: "", annualIrregular: "", savingsPerMonth: "",
  budgetItems: [],
  // Stage 3
  assetItems: [],
  emergencyFund: "",
  // Stage 4
  ppOrValue: "", mortgageBalance: "", mortgageRate: "", loanType: "pi",
  hasInvestmentProperty: "no", ipValue: "", ipMortgage: "", ipRate: "",
  ipWeeklyRent: "", creditCardDebt: "", personalLoanDebt: "", hecsDebt: "",
  // Stage 5
  superBalance: "", partnerSuperBalance: "", employerSgRate: "12",
  salarySacrifice: "", insuranceInSuper: "yes", targetRetirementSpending: "",
  // Stage 6
  retirementLifestyle: "comfortable",
  goals: [],
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
      goals = goals.map(key => {
        const opt = GOAL_OPTIONS.find(o => o.value === key);
        return { key, label: opt?.label || key, amount: "", frequency: "annual", additive: false };
      });
    }
    // Remove corrupted goal entries where key or label is not a string
    goals = goals.filter(g => typeof g.key === "string" && g.key.length > 0 && typeof g.label === "string");

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
    value: "", mortgageBalance: "", mortgageRate: "", loanType: "pi",
    weeklyRent: "", vacancyRate: "4", managementFee: "8",
    councilRates: "", insurance: "", bodyCorpAdmin: "", bodyCorpCapital: "",
    maintenance: "", depreciation: "",
  };
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}


// ─── STAGE FORMS ─────────────────────────────────────────────────────────────

function Stage1({ data, set }) {
  return (
    <div>
      <TwoCol>
        <Field label="First name"><Input value={data.firstName} onChange={v => set("firstName", v)} placeholder="e.g. Alex" /></Field>
        <Field label="Your age"><Input value={data.age} onChange={v => set("age", v)} placeholder="e.g. 34" type="number" /></Field>
      </TwoCol>
      <Field label="Do you have a partner?">
        <Toggle value={data.hasPartner} onChange={v => set("hasPartner", v)}
          options={[{ value: "no", label: "Single" }, { value: "yes", label: "Couple" }]} />
      </Field>
      {data.hasPartner === "yes" && (
        <Field label="Partner's age"><Input value={data.partnerAge} onChange={v => set("partnerAge", v)} placeholder="e.g. 32" type="number" /></Field>
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

function PropertyCard({ ip, onChange, onClone, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const ipVal  = parseFloat(String(ip.value).replace(/,/g, "")) || 0;
  const ipMort = parseFloat(String(ip.mortgageBalance).replace(/,/g, "")) || 0;
  const equity = ipVal - ipMort;

  function upd(field, val) { onChange({ ...ip, [field]: val }); }

  return (
    <div style={{ border: "1.5px solid #d4ddd9", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ padding: "12px 16px", background: "#f9faf9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
              background: ip.status === "existing" ? "#eaf2ef" : "#eaf0f7",
              color: ip.status === "existing" ? "#3d6b5e" : "#3a5a8a",
            }}>
              {ip.status === "existing" ? "Existing" : `Planned ${ip.purchaseYear}`}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#0f1a16", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ip.label}</span>
          </div>
          {(ip.value || ip.weeklyRent) && (
            <div style={{ fontSize: 12, color: "#8a9e98", display: "flex", gap: 16, flexWrap: "wrap" }}>
              {ip.value      && <span>Value {currency(ip.value)}</span>}
              {ipMort > 0    && <span>Equity {currency(equity)}</span>}
              {ip.weeklyRent && <span>${ip.weeklyRent}/wk</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onClone} style={{ fontSize: 11, color: "#6b8f84", background: "none", border: "1px solid #d4ddd9", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Clone</button>
          <button onClick={onRemove} style={{ fontSize: 11, color: "#9a3922", background: "none", border: "1px solid #f0d0c4", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, color: "#3d6b5e", background: "#eaf2ef", border: "1px solid #c4ddd6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {expanded ? "Collapse ▲" : "Edit ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "20px 16px", background: "white", borderTop: "1px solid #e2eae6" }}>
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
            <Field label="Mortgage balance"><Input value={ip.mortgageBalance} onChange={v => upd("mortgageBalance", v)} placeholder="450,000" prefix="$" /></Field>
          </TwoCol>
          <TwoCol>
            <Field label="Interest rate"><Input value={ip.mortgageRate} onChange={v => upd("mortgageRate", v)} placeholder="6.5" suffix="%" /></Field>
            <Field label="Loan type">
              <Select value={ip.loanType} onChange={v => upd("loanType", v)}
                options={[{ value: "pi", label: "Principal & Interest" }, { value: "io", label: "Interest Only" }]} />
            </Field>
          </TwoCol>
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

function PropertyPortfolio({ ips, onChange }) {
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
        <div style={{ textAlign: "center", padding: "24px", background: "#f9faf9", border: "1.5px dashed #d4ddd9", borderRadius: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#8a9e98", marginBottom: 12 }}>No investment properties added yet</div>
          <button onClick={addProperty} style={{ padding: "10px 20px", border: "none", borderRadius: 10, background: "#3d6b5e", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
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
            />
          ))}
          <button onClick={addProperty} style={{ width: "100%", padding: "10px", border: "1.5px dashed #c4ddd6", borderRadius: 10, background: "#f9faf9", fontSize: 13, color: "#3d6b5e", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            + Add another property
          </button>
        </>
      )}
    </div>
  );
}

function Stage4({ data, set }) {
  return (
    <div>
      {(data.homeOwnership === "mortgage" || data.homeOwnership === "owner") && (
        <>
          <TwoCol>
            <Field label="PPOR estimated value"><Input value={data.ppOrValue} onChange={v => set("ppOrValue", v)} placeholder="850,000" prefix="$" /></Field>
            <Field label="Mortgage balance"><Input value={data.mortgageBalance} onChange={v => set("mortgageBalance", v)} placeholder="450,000" prefix="$" /></Field>
          </TwoCol>
          <TwoCol>
            <Field label="Interest rate"><Input value={data.mortgageRate} onChange={v => set("mortgageRate", v)} placeholder="6.2" suffix="%" /></Field>
            <Field label="Loan type">
              <Select value={data.loanType} onChange={v => set("loanType", v)}
                options={[{ value: "pi", label: "Principal & Interest" }, { value: "io", label: "Interest Only" }]} />
            </Field>
          </TwoCol>
        </>
      )}
      <SectionDivider label="Investment properties" />
      <PropertyPortfolio
        ips={data.investmentProperties || []}
        onChange={newIPs => set("investmentProperties", newIPs)}
      />
      <SectionDivider label="Other debts" />
      <TwoCol>
        <Field label="Credit card debt"><Input value={data.creditCardDebt} onChange={v => set("creditCardDebt", v)} placeholder="0" prefix="$" /></Field>
        <Field label="Personal loans"><Input value={data.personalLoanDebt} onChange={v => set("personalLoanDebt", v)} placeholder="0" prefix="$" /></Field>
      </TwoCol>
      <Field label="HECS / HELP debt"><Input value={data.hecsDebt} onChange={v => set("hecsDebt", v)} placeholder="0" prefix="$" /></Field>
    </div>
  );
}

function Stage5({ data, set }) {
  const goals = data.goals || [];

  function toggleGoal(value) {
    const isSelected = goals.some(g => g.key === value);
    if (isSelected) {
      set("goals", goals.filter(g => g.key !== value));
    } else {
      const opt = GOAL_OPTIONS.find(o => o.value === value);
      set("goals", [...goals, { key: value, label: opt?.label || value, amount: "", frequency: "annual", additive: false }]);
    }
  }

  function updateGoal(key, field, val) {
    set("goals", goals.map(g => g.key === key ? { ...g, [field]: val } : g));
  }

  return (
    <div>
      <TwoCol>
        <Field label="Your super balance"><Input value={data.superBalance} onChange={v => set("superBalance", v)} placeholder="68,000" prefix="$" /></Field>
        {data.hasPartner === "yes" && (
          <Field label="Partner's super balance"><Input value={data.partnerSuperBalance} onChange={v => set("partnerSuperBalance", v)} placeholder="55,000" prefix="$" /></Field>
        )}
      </TwoCol>
      <TwoCol>
        <Field label="Employer SG rate" hint="Currently 12% for most employees">
          <Input value={data.employerSgRate} onChange={v => set("employerSgRate", v)} placeholder="12" suffix="%" />
        </Field>
        <Field label="Salary sacrifice (annual)" hint="Extra contributions above SG">
          <Input value={data.salarySacrifice} onChange={v => set("salarySacrifice", v)} placeholder="0" prefix="$" />
        </Field>
      </TwoCol>
      <Field label="Insurance inside super?">
        <Toggle value={data.insuranceInSuper} onChange={v => set("insuranceInSuper", v)}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }]} />
      </Field>

      <SectionDivider label="Retirement target & goals" />
      <Field label="Target annual retirement spending" hint="In today's dollars — what lifestyle do you want in retirement?">
        <Input value={data.targetRetirementSpending} onChange={v => set("targetRetirementSpending", v)} placeholder="65,000" prefix="$" />
      </Field>

      <Field label="What else are you planning for?" hint="Select any goals and add an estimated cost — we'll factor them into your projections">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GOAL_OPTIONS.map(o => {
            const goalObj = goals.find(g => g.key === o.value);
            const isSelected = !!goalObj;
            return (
              <div key={o.value} style={{
                border: "1.5px solid",
                borderColor: isSelected ? "#3d6b5e" : "#d4ddd9",
                borderRadius: 10, overflow: "hidden",
                background: isSelected ? "#eaf2ef" : "#f9faf9",
                transition: "border-color 0.15s, background 0.15s",
              }}>
                <button
                  onClick={() => toggleGoal(o.value)}
                  style={{
                    width: "100%", padding: "10px 14px", border: "none",
                    background: "transparent", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 13, color: isSelected ? "#3d6b5e" : "#2d3a35",
                    textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, border: "2px solid", flexShrink: 0,
                    borderColor: isSelected ? "#3d6b5e" : "#d4ddd9",
                    background: isSelected ? "#3d6b5e" : "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {isSelected && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                  {o.label}
                </button>

                {isSelected && goalObj && (
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid #c4ddd6" }}>
                    <div style={{ fontSize: 11, color: "#6b8f84", marginBottom: 8, marginTop: 10 }}>
                      Estimated spend
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ position: "relative", flex: 1, maxWidth: 140 }}>
                        <span style={{
                          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                          fontSize: 13, color: "#8a9e98", pointerEvents: "none",
                        }}>$</span>
                        <input
                          type="number"
                          value={goalObj.amount}
                          onChange={e => updateGoal(o.value, "amount", e.target.value)}
                          placeholder="0"
                          style={{
                            width: "100%", padding: "7px 10px 7px 22px",
                            border: "1.5px solid #c4ddd6", borderRadius: 8,
                            fontSize: 13, fontFamily: "inherit", background: "white",
                            outline: "none",
                          }}
                        />
                      </div>
                      {[
                        { key: "monthly",   label: "Mo"  },
                        { key: "quarterly", label: "Qtr" },
                        { key: "annual",    label: "Yr"  },
                      ].map(f => (
                        <button
                          key={f.key}
                          onClick={() => updateGoal(o.value, "frequency", f.key)}
                          style={{
                            padding: "7px 12px", border: "1.5px solid",
                            borderColor: goalObj.frequency === f.key ? "#3d6b5e" : "#c4ddd6",
                            borderRadius: 8, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                            background: goalObj.frequency === f.key ? "#3d6b5e" : "white",
                            color: goalObj.frequency === f.key ? "white" : "#6b8f84",
                            fontWeight: goalObj.frequency === f.key ? 600 : 400,
                          }}
                        >{f.label}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div
                        onClick={() => updateGoal(o.value, "additive", !goalObj.additive)}
                        style={{
                          width: 18, height: 18, borderRadius: 4, border: "2px solid", flexShrink: 0, marginTop: 1,
                          borderColor: goalObj.additive ? "#3d6b5e" : "#b0bab6",
                          background: goalObj.additive ? "#3d6b5e" : "white",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        {goalObj.additive && <span style={{ color: "white", fontSize: 11, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span
                        onClick={() => updateGoal(o.value, "additive", !goalObj.additive)}
                        style={{ fontSize: 12, color: "#4a6660", lineHeight: 1.5, cursor: "pointer" }}
                      >
                        This is <strong>in addition to</strong> my retirement spending target
                        {!goalObj.additive && <span style={{ color: "#8a9e98" }}> (currently treated as included in my target)</span>}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>
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
        <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>{meta.label}</div>
        <button
          onClick={() => setShowSource(s => !s)}
          style={{ fontSize: 11, color: "#3d6b5e", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          {showSource ? "Hide source" : "Why this number?"}
        </button>
      </div>
      {showSource && (
        <div style={{
          background: "#eaf2ef", border: "1px solid #c4ddd6", borderRadius: 8,
          padding: "10px 12px", fontSize: 12, color: "#2d5a4e", lineHeight: 1.6, marginBottom: 8,
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
            borderColor: isCustom ? "#3d6b5e" : "#e2eae6",
            borderRadius: 8, fontSize: 14, color: isCustom ? "#0f1a16" : "#8a9e98",
            background: isCustom ? "#f9faf9" : "#f4f7f5",
            outline: "none", fontFamily: "inherit",
          }}
        />
        <span style={{ fontSize: 13, color: "#6b8f84", width: 20 }}>%</span>
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

function ScenarioPanel({ scenarioKey, label, data, set, isActive, isCustom }) {
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
    base: { bg: "#eaf2ef", border: "#c4ddd6", active: "#3d6b5e" },
    conservative: { bg: "#f5f0eb", border: "#e0d5c5", active: "#8a6a3a" },
    aggressive: { bg: "#eaf0f7", border: "#c4d5e8", active: "#3a5a8a" },
  };
  const c = colors[scenarioKey];

  return (
    <div style={{
      border: "2px solid", borderColor: isActive ? c.active : c.border,
      borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s",
    }}>
      <button
        onClick={() => set("activeScenario", scenarioKey)}
        style={{
          width: "100%", padding: "12px 16px", background: isActive ? c.bg : "white",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%", border: "2px solid",
            borderColor: isActive ? c.active : "#d4ddd9",
            background: isActive ? c.active : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isActive && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? c.active : "#2d3a35" }}>{label}</div>
        </div>
        <div style={{ fontSize: 12, color: "#8a9e98" }}>
          {assumptions.returnRate}% return · {assumptions.inflation}% inflation · {assumptions.propertyGrowth}% property
        </div>
      </button>

      {isActive && (
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

const GOAL_OPTIONS = [
  { value: "travel", label: "✈️  Travel extensively in retirement" },
  { value: "inheritance", label: "🏡  Leave an inheritance for family" },
  { value: "education", label: "🎓  Fund children's education" },
  { value: "property", label: "🏠  Buy another property" },
  { value: "payoff-home", label: "🔑  Pay off home before retiring" },
  { value: "early-retire", label: "⏰  Retire earlier than planned" },
  { value: "business", label: "💼  Start or invest in a business" },
  { value: "charity", label: "❤️  Give to charity or causes" },
];

function Stage6({ data, set }) {
  return (
    <div>
      <Field label="What retirement lifestyle are you planning for?">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { value: "basic", label: "Basic", desc: "Modest, needs-based" },
            { value: "comfortable", label: "Comfortable", desc: "ASFA comfortable standard" },
            { value: "generous", label: "Generous", desc: "Lifestyle-rich" },
          ].map(o => (
            <button
              key={o.value}
              onClick={() => set("retirementLifestyle", o.value)}
              style={{
                flex: 1, padding: "12px 8px", border: "1.5px solid",
                borderColor: data.retirementLifestyle === o.value ? "#3d6b5e" : "#d4ddd9",
                borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                background: data.retirementLifestyle === o.value ? "#eaf2ef" : "#f9faf9",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: data.retirementLifestyle === o.value ? "#3d6b5e" : "#2d3a35", marginBottom: 3 }}>{o.label}</div>
              <div style={{ fontSize: 11, color: "#8a9e98" }}>{o.desc}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Risk tolerance">
        <Toggle
          value={data.riskTolerance}
          onChange={v => set("riskTolerance", v)}
          options={[
            { value: "conservative", label: "Conservative" },
            { value: "balanced", label: "Balanced" },
            { value: "growth", label: "Growth" },
          ]}
        />
      </Field>

      <SectionDivider label="Planning scenario & assumptions" />

      <div style={{
        background: "#f4f7f5", border: "1px solid #e2eae6", borderRadius: 10,
        padding: "12px 14px", marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35", marginBottom: 4 }}>
          How do assumptions work?
        </div>
        <div style={{ fontSize: 12, color: "#6b8f84", lineHeight: 1.6 }}>
          Select a scenario below to run your analysis under different market conditions.
          By default, each scenario uses carefully researched assumptions. If you want to adjust
          any numbers, turn on custom assumptions — you can always reset back to defaults.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>Assumptions mode</div>
        <button
          onClick={() => set("useCustomAssumptions", !data.useCustomAssumptions)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
            border: "1.5px solid", borderColor: data.useCustomAssumptions ? "#3d6b5e" : "#d4ddd9",
            borderRadius: 20, background: data.useCustomAssumptions ? "#eaf2ef" : "white",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            color: data.useCustomAssumptions ? "#3d6b5e" : "#6b7a74",
          }}
        >
          <div style={{
            width: 32, height: 18, borderRadius: 9, background: data.useCustomAssumptions ? "#3d6b5e" : "#d4ddd9",
            position: "relative", transition: "background 0.2s",
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%", background: "white",
              position: "absolute", top: 2, left: data.useCustomAssumptions ? 16 : 2,
              transition: "left 0.2s",
            }} />
          </div>
          {data.useCustomAssumptions ? "Custom assumptions on" : "Using default assumptions"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            isCustom={!!data.useCustomAssumptions}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ANALYSIS SCREEN ─────────────────────────────────────────────────────────

function ScenarioToggle({ data, set }) {
  const scenarios = [
    { key: "base", label: "Base" },
    { key: "conservative", label: "Conservative" },
    { key: "aggressive", label: "Aggressive" },
  ];
  const assumptions = getActiveAssumptions(data);

  return (
    <div style={{
      background: "#f4f7f5", border: "1px solid #e2eae6", borderRadius: 12,
      padding: "14px 16px", marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: "#8a9e98", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        Planning scenario
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {scenarios.map(s => (
          <button
            key={s.key}
            onClick={() => set("activeScenario", s.key)}
            style={{
              flex: 1, padding: "8px 0", border: "1.5px solid",
              borderColor: data.activeScenario === s.key ? "#3d6b5e" : "#d4ddd9",
              borderRadius: 8, fontSize: 13, fontWeight: data.activeScenario === s.key ? 600 : 400,
              color: data.activeScenario === s.key ? "#3d6b5e" : "#6b7a74",
              background: data.activeScenario === s.key ? "#eaf2ef" : "white",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Return", value: assumptions.returnRate + "% p.a." },
          { label: "Inflation", value: assumptions.inflation + "% p.a." },
          { label: "Property", value: assumptions.propertyGrowth + "% p.a." },
          { label: "Withdrawal", value: assumptions.safeWithdrawal + "%" },
        ].map((item, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>{item.value}</div>
          </div>
        ))}
        {data.useCustomAssumptions && (
          <div style={{ marginLeft: "auto", fontSize: 11, color: "#b8913a", background: "#f5eddb", padding: "3px 8px", borderRadius: 20, alignSelf: "center" }}>
            Custom assumptions
          </div>
        )}
      </div>
    </div>
  );
}

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
  ];

  const subColor = (ok) => ok === true ? "#3d6b5e" : ok === false ? "#9a3922" : "#8a9e98";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: "#f9faf9", border: "1.5px solid #e2eae6",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#8a9e98", marginBottom: 2,
          }}>
            {card.label}
          </div>
          {card.sub2 && (
            <div style={{ fontSize: 10, color: "#b0bab6", marginBottom: 6 }}>{card.sub2}</div>
          )}
          <div style={{
            fontSize: 19, fontWeight: 500, color: "#0f1a16",
            fontFamily: "Instrument Serif, serif",
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
      <path d={bgPath} fill="none" stroke="#e2eae6" strokeWidth={strokeW} strokeLinecap="round" />
      <path d={bgPath} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(1)} ${arcLen.toFixed(1)}`} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontFamily="Instrument Serif, serif"
        fontSize="30" fill={color}>{successRate}%</text>
    </svg>
  );
}

// ─── MONTE CARLO CARD ─────────────────────────────────────────────────────────

function MonteCarloCard({ data, engine }) {
  const mc = engine?.monteCarlo;
  const hasTarget = parseFloat(String(data.targetRetirementSpending).replace(/,/g, "")) > 0;

  if (!hasTarget) return (
    <div style={{ background: "#f4f7f5", border: "1px solid #e2eae6", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a9e98", marginBottom: 6 }}>Retirement Probability</div>
      <div style={{ fontSize: 13, color: "#a0aba6" }}>Enter a target retirement spending in Stage 5 to see Monte Carlo simulation</div>
    </div>
  );

  if (!mc) return null;

  const { successRate, retirementBalance, iterations, stdDev } = mc;
  const isStrong  = successRate >= 85;
  const isWatch   = successRate >= 70 && successRate < 85;
  const color = isStrong ? "#3d6b5e" : isWatch ? "#b8913a" : "#9a3922";
  const bg    = isStrong ? "#eaf2ef" : isWatch ? "#f5eddb" : "#fdf4f0";
  const bdr   = isStrong ? "#c4ddd6" : isWatch ? "#e0cfa0" : "#f0d0c4";
  const label = isStrong ? "Strong" : isWatch ? "Watch zone" : "Needs attention";
  const desc  = isStrong
    ? `High confidence your plan funds retirement to age ${data.lifeExpectancy || 90}`
    : isWatch
    ? "Some cashflow pressure in retirement — review your contributions and spending target"
    : "High risk of running short in retirement — consider increasing contributions or adjusting targets";

  return (
    <div style={{ background: bg, border: `1.5px solid ${bdr}`, borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a9e98", marginBottom: 10 }}>
        Retirement Probability
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <RetirementGauge successRate={successRate} color={color} />
        <div style={{ paddingTop: 6, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}20`, padding: "3px 10px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>{label}</span>
          <div style={{ fontSize: 12, color: "#6b8f84", lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 10, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Super at retirement — range</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>
            {currency(retirementBalance.p10)} — {currency(retirementBalance.p90)}
          </div>
          <div style={{ fontSize: 10, color: "#b0bab6" }}>10th to 90th percentile</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Median outcome</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>{currency(retirementBalance.p50)}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#b0bab6" }}>{iterations.toLocaleString()} simulations</div>
          <div style={{ fontSize: 10, color: "#b0bab6" }}>{Math.round(stdDev * 100)}% annual volatility</div>
        </div>
      </div>
    </div>
  );
}

// ─── NET WORTH CHART ──────────────────────────────────────────────────────────

function NetWorthChart({ engine, data }) {
  const trajectory = engine?.trajectory;
  if (!trajectory || trajectory.length < 2) return null;

  const retirementAge = parseInt(data.retirementAge) || 65;
  const lifeExp       = parseInt(data.lifeExpectancy) || 90;
  const W = 600, H = 200;
  const mg = { top: 20, right: 20, bottom: 28, left: 70 };
  const cW = W - mg.left - mg.right;
  const cH = H - mg.top - mg.bottom;

  const nws    = trajectory.map(t => t.netWorth);
  const minAge = trajectory[0].age;
  const maxAge = trajectory[trajectory.length - 1].age;
  const rawMin = Math.min(0, ...nws);
  const rawMax = Math.max(...nws);
  const range  = rawMax - rawMin || 1;

  const xS = age => mg.left + ((age - minAge) / (maxAge - minAge)) * cW;
  const yS = nw  => mg.top  + cH - ((nw - rawMin) / range) * cH;

  const linePath = trajectory.map((t, i) =>
    `${i === 0 ? "M" : "L"} ${xS(t.age).toFixed(1)} ${yS(t.netWorth).toFixed(1)}`
  ).join(" ");

  const areaPath =
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
    nw: rawMin + (range / 4) * i,
    y:  yS(rawMin + (range / 4) * i),
  }));

  const retX     = xS(retirementAge);
  const retPoint = trajectory.find(t => t.age === retirementAge);
  const endPoint = trajectory[trajectory.length - 1];

  return (
    <div style={{ background: "#f9faf9", border: "1.5px solid #e2eae6", borderRadius: 12, padding: "16px 16px 12px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a9e98", marginBottom: 12 }}>
        Net Worth Trajectory
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3d6b5e" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#3d6b5e" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="nwClip">
            <rect x={mg.left} y={mg.top - 5} width={cW} height={cH + 10} />
          </clipPath>
        </defs>

        {yTicks.map(({ nw, y }, i) => (
          <g key={i}>
            <line x1={mg.left} x2={W - mg.right} y1={y} y2={y}
              stroke={i === 0 ? "#c4ddd6" : "#eaeeed"} strokeWidth={i === 0 ? 1.5 : 1} />
            <text x={mg.left - 6} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#b0bab6">{fmt(nw)}</text>
          </g>
        ))}

        <line x1={retX} x2={retX} y1={mg.top} y2={mg.top + cH}
          stroke="#3d6b5e" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
        <text x={retX + 5} y={mg.top + 12} fontSize="9" fill="#3d6b5e" opacity="0.65">
          Retire {retirementAge}
        </text>

        <g clipPath="url(#nwClip)">
          <path d={areaPath} fill="url(#nwGrad)" />
          <path d={linePath} fill="none" stroke="#3d6b5e" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <circle cx={xS(minAge)} cy={yS(trajectory[0].netWorth)} r="3.5"
          fill="white" stroke="#3d6b5e" strokeWidth="2" />
        {retPoint && (
          <circle cx={retX} cy={yS(retPoint.netWorth)} r="4"
            fill="#3d6b5e" stroke="white" strokeWidth="2" />
        )}
        <circle cx={xS(maxAge)} cy={yS(endPoint.netWorth)} r="3.5"
          fill="white" stroke="#3d6b5e" strokeWidth="2" />

        {[minAge, retirementAge, maxAge].map((age, i) => (
          <text key={i} x={xS(age)} y={H - 4} textAnchor="middle" fontSize="9.5" fill="#b0bab6">
            Age {age}
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 24, fontSize: 11, color: "#8a9e98", marginTop: 6, flexWrap: "wrap" }}>
        <span>Today: <strong style={{ color: "#0f1a16", fontFamily: "Instrument Serif, serif", fontSize: 13 }}>{currency(trajectory[0].netWorth)}</strong></span>
        {retPoint && (
          <span>At retirement: <strong style={{ color: "#0f1a16", fontFamily: "Instrument Serif, serif", fontSize: 13 }}>{currency(retPoint.netWorth)}</strong></span>
        )}
        <span>Age {lifeExp}: <strong style={{ color: "#0f1a16", fontFamily: "Instrument Serif, serif", fontSize: 13 }}>{currency(endPoint.netWorth)}</strong></span>
      </div>
    </div>
  );
}

// ─── SCENARIO COMPARISON ROW ──────────────────────────────────────────────────

function ScenarioComparisonRow({ data }) {
  const SCENS = [
    { key: "conservative", label: "Conservative", color: "#7a6840", bg: "#f8f4ec", bdr: "#e4d8bc" },
    { key: "base",         label: "Base",         color: "#3d6b5e", bg: "#eaf2ef", bdr: "#c4ddd6" },
    { key: "aggressive",   label: "Aggressive",   color: "#2a5480", bg: "#eaf0f8", bdr: "#b8cde0" },
  ];
  const assetTotals = deriveAssetTotals(data.assetItems);
  const engines = SCENS.map(({ key }) =>
    runEngine({ ...data, ...assetTotals, activeScenario: key, useCustomAssumptions: false })
  );
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a9e98", marginBottom: 10 }}>
        Scenario Comparison
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {SCENS.map(({ key, label, color, bg, bdr }, idx) => {
          const eng = engines[idx];
          const mc  = eng.monteCarlo;
          const isActive = data.activeScenario === key && !data.useCustomAssumptions;
          return (
            <div key={key} style={{
              background: isActive ? bg : "#f9faf9",
              border: `1.5px solid ${isActive ? bdr : "#e2eae6"}`,
              borderRadius: 12, padding: "14px 14px", position: "relative",
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", top: 10, right: 10,
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  color, background: `${color}18`, padding: "2px 7px", borderRadius: 10,
                }}>Active</div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 12 }}>{label}</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Super at retirement</div>
                <div style={{ fontSize: 17, fontFamily: "Instrument Serif, serif", color: "#0f1a16" }}>
                  {currency(eng.metrics.projectedSuper)}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Net worth at retirement</div>
                <div style={{ fontSize: 17, fontFamily: "Instrument Serif, serif", color: "#0f1a16" }}>
                  {currency(eng.metrics.retirementNetWorth)}
                </div>
              </div>
              {mc ? (
                <div>
                  <div style={{ fontSize: 9, color: "#a0aba6", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Probability of success</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 22, fontFamily: "Instrument Serif, serif", color, lineHeight: 1 }}>{mc.successRate}%</span>
                    <div style={{ flex: 1, height: 5, background: "#e2eae6", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${mc.successRate}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#b0bab6", fontStyle: "italic" }}>Add retirement spending target for simulation</div>
              )}
              <div style={{ fontSize: 9, color: "#c0c8c4", marginTop: 10, borderTop: "1px solid #eaeeed", paddingTop: 8 }}>
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
  const m    = engine?.metrics;
  const mort = engine?.mortgage;
  const dd   = engine?.drawdown;
  const mc   = engine?.monteCarlo;

  const couple = data.hasPartner === "yes";
  const firstName = data.firstName || "";
  const possessive = firstName ? `${firstName}'s` : (couple ? "Your household's" : "Your");
  const scenarioLabel = { base: "Base", conservative: "Conservative", aggressive: "Aggressive" }[data.activeScenario || "base"];
  const retireAge = n(data.retirementAge) || 65;
  const lifeExp = n(data.lifeExpectancy) || 90;
  const lifestyleLabel = { basic: "a basic", comfortable: "a comfortable", generous: "a generous, lifestyle-rich" }[data.retirementLifestyle] || "a comfortable";

  const aT = deriveAssetTotals(data.assetItems || []);
  const liquidTotal = aT.cashSavings + aT.sharesEtfs + aT.managedFunds + aT.crypto + aT.otherInvestments;
  const allIPs = data.investmentProperties || [];
  const totalAssets = [aT.cashSavings, aT.sharesEtfs, aT.managedFunds, aT.crypto, aT.otherInvestments,
    n(data.superBalance), couple ? n(data.partnerSuperBalance) : 0, n(data.ppOrValue),
    ...allIPs.map(ip => n(ip.value))].reduce((s, v) => s + v, 0);
  const totalDebts = [n(data.mortgageBalance), n(data.creditCardDebt), n(data.personalLoanDebt), n(data.hecsDebt),
    ...allIPs.map(ip => n(ip.mortgageBalance))].reduce((s, v) => s + v, 0);
  const netWorth = totalAssets - totalDebts;

  const netMonthly = estimateNetMonthly(data);
  const budgetItems = data.budgetItems || [];
  const totalExpenses = budgetTotal(budgetItems) || n(data.monthlyExpenses);
  const savings = n(data.savingsPerMonth);
  const monthlySurplus = netMonthly - totalExpenses - savings;
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
    sections.push({ title: "Financial position", color: "#3d6b5e", text: parts.join(" ") });
  }

  // ── 2. Income & cashflow ──
  if (netMonthly > 0) {
    const parts = [];
    let cf = `Estimated take-home income is ${currency(netMonthly)}/month after FY2026-27 tax${couple ? " across both incomes" : ""}.`;
    if (totalExpenses > 0) {
      const surplusText = monthlySurplus >= 0
        ? `a ${currency(monthlySurplus)}/month surplus` : `a ${currency(Math.abs(monthlySurplus))}/month shortfall`;
      cf += ` After ${currency(totalExpenses)}/month in spending${savings > 0 ? ` and ${currency(savings)}/month in savings` : ""}, the budget runs ${surplusText}.`;
    }
    parts.push(cf);
    if (tightMonths.length > 0) {
      parts.push(`Watch ${tightMonths.map(r => r.short).join(", ")} — ${tightMonths.length === 1 ? "that month sees" : "those months see"} lump-sum expenses that tighten cashflow against the monthly run-rate.`);
    }
    sections.push({ title: "Income & cashflow", color: "#2a5480", text: parts.join(" ") });
  }

  // ── 3. Super & retirement ──
  if (hasSuperData) {
    const parts = [];
    if (hasTarget && dd) {
      const spendDesc = additiveGoalAmt > 0
        ? `${currency(effectiveSpend)}/year (your ${currency(baseSpend)} target plus ${currency(additiveGoalAmt)}/year in additional goal spending)`
        : `${currency(effectiveSpend)}/year`;
      parts.push(`Targeting ${lifestyleLabel} retirement at ${spendDesc} today, growing to ${currency(dd.futureSpending)}/year by age ${retireAge}.`);
      if (m?.lastsToLifeExpectancy) {
        parts.push(`Projected super of ${currency(m.projectedSuper)} is sufficient to fund spending all the way to age ${lifeExp} — the full life expectancy modelled.`);
      } else if (m?.depletionAge) {
        parts.push(`Projected super of ${currency(m.projectedSuper)} would run out at age ${m.depletionAge}, ${m.depletionAge - retireAge} years into retirement. Closing the ${currency(Math.abs(m?.superSurplus || 0))} gap is worth modelling with an adviser.`);
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
    sections.push({ title: "Superannuation & retirement", color: "#5a7840", text: parts.join(" ") });
  }

  // ── 4. Property & debt ──
  if (hasMortgage || hasHecs || hasCreditCard || hasPersonalLoan || existingIPs.length > 0) {
    const parts = [];
    if (hasMortgage && mort) {
      parts.push(mort.type === "io"
        ? `The PPOR mortgage of ${currency(n(data.mortgageBalance))} is interest-only — the principal doesn't reduce and will need to be managed before or at maturity.`
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
  if (hasMortgage && mort?.type === "pi")
    adviserPoints.push("Offset account vs extra repayments vs investing the surplus — the right call depends on your mortgage rate vs expected after-tax returns");
  if (hasMortgage && mort?.type === "io")
    adviserPoints.push("Interest-only exit strategy — how to manage the transition when the IO period ends");
  if (hasCreditCard || hasPersonalLoan)
    adviserPoints.push("High-interest debt elimination — repaying credit cards and personal loans typically beats investing the same money");
  if (hasHecs)
    adviserPoints.push("HECS-HELP voluntary repayment — there's no interest charged, so it's rarely the priority, but it does affect borrowing capacity");
  if (existingIPs.length > 0)
    adviserPoints.push("Investment property tax position — depreciation schedule, negative gearing benefits, and CGT implications on eventual sale");
  if (n(data.superBalance) > 0)
    adviserPoints.push("Insurance review — life and income protection coverage inside and outside of super");
  adviserPoints.push("Estate planning — will, super beneficiary nominations, and enduring power of attorney");

  const SectionBlock = ({ title, color, text }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        color, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${color}30`,
      }}>{title}</div>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: "#2d3a35", margin: 0 }}>{text}</p>
    </div>
  );

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{
        background: "#eaf2ef", border: "1px solid #c4ddd6", borderRadius: 12,
        padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          width: 34, height: 34, background: "#3d6b5e", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "Instrument Serif, serif", fontSize: 17, color: "white", flexShrink: 0,
        }}>C</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#3d6b5e", marginBottom: 1 }}>Clearpath Summary</div>
          <div style={{ fontSize: 11, color: "#8a9e98" }}>
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
                  padding: "8px 12px", background: "#f9faf9", borderRadius: 8, border: "1px solid #e2eae6",
                }}>
                  <div style={{ flex: 1, fontSize: 13, color: "#2d3a35", minWidth: 160 }}>{g.label}</div>
                  {amt > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#3d6b5e", whiteSpace: "nowrap" }}>
                      {currency(amt)}{freqLabel}
                    </div>
                  )}
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                    color: g.additive ? "#2a5480" : "#6b8f84",
                    background: g.additive ? "#eaf0f8" : "#f0f4f2",
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
            <div style={{ marginTop: 8, fontSize: 12, color: "#8a9e98", lineHeight: 1.5 }}>
              No goals are currently marked as additional to your retirement target. Tick "in addition to" on any goal in Stage 6 to include its cost in the projections.
            </div>
          )}
        </div>
      )}

      {adviserPoints.length > 0 && (
        <div style={{ background: "#f4f7f5", border: "1px solid #e2eae6", borderRadius: 12, padding: "18px 18px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b8f84", marginBottom: 12 }}>
            Topics to discuss with your adviser
          </div>
          {adviserPoints.map((pt, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <div style={{ color: "#3d6b5e", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 2 }}>→</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "#4a6660" }}>{pt}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2eae6", fontSize: 11, color: "#a0aba6", lineHeight: 1.5 }}>
            The above are topics for discussion only. Nothing in this summary constitutes personal financial advice. For tailored recommendations, engage a licensed Australian financial adviser (AFSL holder).
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisScreen({ data, set }) {
  const aT = deriveAssetTotals(data.assetItems);
  const baseSpend = parseFloat(String(data.targetRetirementSpending || "").replace(/,/g, "")) || 0;
  const additiveGoals = goalAnnualAdditive(data.goals);
  const effectiveSpend = baseSpend + additiveGoals;
  const derivedData = {
    ...data, ...aT,
    targetRetirementSpending: effectiveSpend > 0 ? String(effectiveSpend) : data.targetRetirementSpending,
  };
  const engine = runEngine(derivedData);

  return (
    <div>
      <ScenarioToggle data={data} set={set} />
      <MetricsRow engine={engine} data={data} />
      <MonteCarloCard data={data} engine={engine} />
      <NetWorthChart engine={engine} data={data} />
      <ScenarioComparisonRow data={data} />
      {(data.budgetItems || []).length > 0 && (() => {
        const netMo = estimateNetMonthly(data);
        const startCash = deriveAssetTotals(data.assetItems).cashSavings;
        return netMo > 0
          ? <CashflowCalendar items={data.budgetItems} netMonthly={netMo} startingCash={startCash} />
          : null;
      })()}
      <AnalysisSummary data={data} engine={engine} />
      <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
        <button onClick={() => window.print()} style={{
          padding: "10px 20px", border: "none", borderRadius: 10,
          background: "#3d6b5e", color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Print / Save PDF</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function ClearpathMVP() {
  const [data, setData] = useState(() => loadData());
  const [stage, setStage] = useState(1);
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
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 50);
  }

  function next() { goTo(Math.min(stage + 1, 7)); }
  function back() { goTo(Math.max(stage - 1, 1)); }

  const progress = ((stage - 1) / 6) * 100;
  const currentStage = STAGES[stage - 1];

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
    <div style={{ minHeight: "100vh", background: "#f4f7f5", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap'); @keyframes bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-5px); opacity: 1; } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } * { box-sizing: border-box; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }"}</style>

      <header style={{ background: "white", borderBottom: "1px solid #e2eae6", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontFamily: "Instrument Serif, serif", fontSize: 20, color: "#0f1a16" }}>
            Clear<span style={{ color: "#3d6b5e" }}>path</span>
          </div>
          <div style={{ fontSize: 10, color: "#8a9e98", letterSpacing: "0.08em", textTransform: "uppercase" }}>Australian Financial Planner</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {data.firstName && <div style={{ fontSize: 12, color: "#6b8f84" }}>Hi, {data.firstName} 👋</div>}
          <button
            onClick={() => { if (window.confirm("Clear all saved data?")) { localStorage.removeItem(STORAGE_KEY); setData({ ...EMPTY_DATA }); setStage(1); } }}
            style={{ fontSize: 11, color: "#a0aba6", background: "none", border: "1px solid #e2eae6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >Clear data</button>
        </div>
      </header>

      <div style={{ background: "white", borderBottom: "1px solid #e2eae6", padding: "0 28px 14px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {STAGES.map(s => (
            <button key={s.id} onClick={() => s.id < stage ? goTo(s.id) : null}
              style={{
                flex: 1, padding: "6px 0", border: "none",
                background: s.id === stage ? "#3d6b5e" : s.id < stage ? "#c4ddd6" : "#e8f0ee",
                borderRadius: 6, cursor: s.id < stage ? "pointer" : "default",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all 0.2s",
              }}>
              <div style={{ fontSize: 12 }}>{s.icon}</div>
              <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.04em", color: s.id === stage ? "white" : s.id < stage ? "#2d6558" : "#8ab5aa", textTransform: "uppercase" }}>{s.label}</div>
            </button>
          ))}
        </div>
        <div style={{ height: 3, background: "#e8f0ee", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", background: "#3d6b5e", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {(data.grossIncome || data.superBalance || (data.assetItems || []).length > 0) && (
        <div style={{ background: "#3d6b5e", padding: "10px 28px", display: "flex", gap: 24, overflowX: "auto" }}>
          {[
            { label: "Net Worth", value: currency(netWorth) },
            { label: "Super", value: currency(data.superBalance) },
            { label: "Monthly Savings", value: currency(data.savingsPerMonth) },
            { label: "Emergency Runway", value: runway === "—" ? "—" : (runway + " mo") },
            { label: "Scenario", value: { base: "Base", conservative: "Conservative", aggressive: "Aggressive" }[data.activeScenario] || "Base" },
          ].map((item, i) => (
            <div key={i} style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "white", marginTop: 1 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "32px 20px 100px" }}>
        <div style={{ width: "100%", maxWidth: 620 }}>
          <div style={{ marginBottom: 28, animation: "fadeIn 0.3s ease" }}>
            <div style={{ fontSize: 11, color: "#8a9e98", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Step {stage} of 7</div>
            <div style={{ fontFamily: "Instrument Serif, serif", fontSize: 28, color: "#0f1a16", marginBottom: 4 }}>{currentStage.title}</div>
            <div style={{ fontSize: 14, color: "#6b8f84" }}>{currentStage.subtitle}</div>
          </div>

          <div ref={scrollRef} style={{ background: "white", borderRadius: 18, border: "1px solid #e2eae6", padding: "28px", animation: "fadeIn 0.25s ease", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
            {stage === 1 && <Stage1 data={data} set={set} />}
            {stage === 2 && <Stage2 data={data} setMany={setMany} />}
            {stage === 3 && <AssetStage3 data={data} setMany={setMany} />}
            {stage === 4 && <Stage4 data={data} set={set} />}
            {stage === 5 && <Stage5 data={data} set={set} />}
            {stage === 6 && <Stage6 data={data} set={set} />}
            {stage === 7 && <AnalysisScreen data={data} set={set} />}
          </div>

          {stage < 7 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              {stage > 1 ? (
                <button onClick={back} style={{ padding: "12px 24px", border: "1.5px solid #d4ddd9", borderRadius: 12, background: "white", fontSize: 14, color: "#4a6660", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              ) : <div />}
              <button onClick={next} style={{ padding: "12px 28px", border: "none", borderRadius: 12, background: "#3d6b5e", color: "white", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(61,107,94,0.3)" }}>
                {stage === 6 ? "View My Analysis →" : "Continue →"}
              </button>
            </div>
          )}

          {stage === 7 && (
            <div style={{ marginTop: 20 }}>
              <button onClick={back} style={{ padding: "12px 24px", border: "1.5px solid #d4ddd9", borderRadius: 12, background: "white", fontSize: 14, color: "#4a6660", cursor: "pointer", fontFamily: "inherit" }}>← Edit my details</button>
            </div>
          )}
        </div>
      </div>

      <footer style={{ background: "white", borderTop: "1px solid #e2eae6", padding: "16px 28px", textAlign: "center", marginTop: "auto" }}>
        <div style={{ fontSize: 11, color: "#a0aba6", lineHeight: 1.6, maxWidth: 620, margin: "0 auto" }}>
          <strong style={{ color: "#6b7a74" }}>General information only.</strong> Clearpath is an educational planning tool and does not provide personal financial advice. All projections and analysis are illustrative estimates based on the information you enter. Before making financial decisions, consider seeking advice from a licensed Australian financial adviser (AFSL holder). Past performance is not a reliable indicator of future performance.
        </div>
      </footer>
    </div>
  );
}
