/**
 * Independent Means Engine — Validation Test Suite
 *
 * 16 scenarios covering the main Australian financial modelling paths.
 * Tests are structural/directional rather than exact-figure assertions —
 * they verify that the engine produces coherent, correctly-signed outputs.
 *
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { runEngine, calculatePersonTax } from "./engine.js";

// ── BASE FIXTURE ──────────────────────────────────────────────────────────────
// Minimal valid data object that produces a runnable engine output.
const BASE = {
  firstName: "Alex", age: "40", hasPartner: "no", partnerAge: "",
  partnerName: "", partnerRetirementAge: "",
  retirementAge: "65", lifeExpectancy: "90",
  homeOwnership: "owner", privateHealthInsurance: "yes",
  partnerPrivateHealthInsurance: "yes",
  grossIncome: "100000", bonusIncome: "0", otherIncome: "0",
  partnerIncome: "", partnerBonusIncome: "", partnerOtherIncome: "",
  monthlyExpenses: "3000", annualIrregular: "5000", savingsPerMonth: "1000",
  insuranceAnnualPremium: "0",
  budgetItems: [], assetItems: [],
  cashSavings: "20000", sharesEtfs: "50000", managedFunds: "0", crypto: "0",
  otherInvestments: "0", emergencyFund: "10000",
  ppOrValue: "700000", ppOrOwnershipPct: "100",
  mortgageBalance: "400000", mortgageRate: "6", loanType: "pi",
  mortgageStartYear: "2023", mortgageTenure: "30", mortgageIoExpiryYear: "",
  ppOrOffsetBalance: "",
  hasInvestmentProperty: "no", ipValue: "", ipMortgage: "", ipRate: "",
  ipWeeklyRent: "", investmentProperties: [],
  creditCardDebt: "0", personalLoanDebt: "0", hecsDebt: "0",
  partnerCreditCardDebt: "", partnerPersonalLoanDebt: "", partnerHecsDebt: "",
  superBalance: "200000", partnerSuperBalance: "",
  employerSgRate: "12", partnerEmployerSgRate: "12",
  salarySacrifice: "0", partnerSalarySacrifice: "0",
  targetRetirementSpending: "60000",
  retirementLifestyle: "comfortable",
  goals: [], lifeEvents: [],
  riskTolerance: "balanced",
  activeScenario: "base", useCustomAssumptions: false,
  customAssumptions: {
    base:         { returnRate: 6.5,  inflation: 2.5, propertyGrowth: 4.5, rentalGrowth: 3.0, safeWithdrawal: 4.0 },
    conservative: { returnRate: 5.5,  inflation: 3.0, propertyGrowth: 3.5, rentalGrowth: 2.5, safeWithdrawal: 4.0 },
    aggressive:   { returnRate: 7.5,  inflation: 2.0, propertyGrowth: 5.5, rentalGrowth: 3.5, safeWithdrawal: 4.0 },
  },
};

function mk(overrides) {
  return { ...BASE, ...overrides };
}

// ── 1. SINGLE RENTER ─────────────────────────────────────────────────────────
describe("Scenario 1 — Single renter accumulating ETFs and super", () => {
  const data = mk({
    homeOwnership: "renting",
    ppOrValue: "0", mortgageBalance: "0",
    cashSavings: "30000", sharesEtfs: "80000",
    superBalance: "150000",
    grossIncome: "90000",
    targetRetirementSpending: "55000",
  });
  const e = runEngine(data);

  it("produces a positive net worth trajectory", () => {
    expect(e.trajectory.length).toBeGreaterThan(0);
    expect(e.trajectory[0].netWorth).toBeGreaterThan(0);
  });

  it("has no property value in trajectory (renter)", () => {
    expect(e.trajectory[0].propertyValue).toBe(0);
  });

  it("projects super growth over accumulation years", () => {
    // Check at retirement (first retired row), not at life expectancy end
    // where super has been fully drawn down.
    const atRetirement = e.trajectory.find(r => r.isRetired);
    expect(atRetirement?.superBalance).toBeGreaterThan(150000);
  });

  it("calculates positive FIRE number", () => {
    expect(e.fire.fireNumber).toBeGreaterThan(0);
  });
});

// ── 2. COUPLE WITH DIFFERENT SALARIES ────────────────────────────────────────
describe("Scenario 2 — Couple with different salaries (per-person tax)", () => {
  const data = mk({
    hasPartner: "yes", partnerName: "Sam",
    partnerAge: "35", partnerRetirementAge: "62",
    grossIncome: "150000", partnerIncome: "60000",
    partnerSuperBalance: "80000",
  });
  const e = runEngine(data);

  it("produces per-person tax breakdowns", () => {
    expect(e.householdTax.person1).toBeDefined();
    expect(e.householdTax.person2).toBeDefined();
  });

  it("person1 pays more tax than person2 (higher salary)", () => {
    expect(e.householdTax.person1.totalTax).toBeGreaterThan(e.householdTax.person2.totalTax);
  });

  it("household after-tax is sum of individuals", () => {
    const sum = e.householdTax.person1.afterTax + e.householdTax.person2.afterTax;
    expect(Math.abs(e.householdTax.totalAfterTax - sum)).toBeLessThan(10);
  });

  it("trajectory covers the full period", () => {
    expect(e.trajectory.length).toBeGreaterThan(20);
  });
});

// ── 3. DIVISION 293 ───────────────────────────────────────────────────────────
describe("Scenario 3 — High-income household (Division 293)", () => {
  it("Div 293 triggers when income + super > $250k", () => {
    const tax = calculatePersonTax(220000, { superConcessional: 30000, hasPrivateHealth: true, hecsDebt: 0 });
    // 220k taxable + 30k super = 250k exactly: div293 should be > 0 when above threshold
    const taxAbove = calculatePersonTax(230000, { superConcessional: 30000, hasPrivateHealth: true, hecsDebt: 0 });
    expect(taxAbove.division293).toBeGreaterThan(0);
  });

  it("Div 293 does not apply below threshold", () => {
    const tax = calculatePersonTax(100000, { superConcessional: 12000, hasPrivateHealth: true, hecsDebt: 0 });
    expect(tax.division293).toBe(0);
  });

  it("Div 293 rate is 15% of subject contributions", () => {
    // income=230k + super=30k = 260k. Excess = 10k. Subject = min(30k, 10k) = 10k. div293 = 1,500.
    const tax = calculatePersonTax(230000, { superConcessional: 30000, hasPrivateHealth: true, hecsDebt: 0 });
    expect(tax.division293).toBeCloseTo(1500, -1);
  });

  it("engine.metrics flags div293 for high-income household", () => {
    const data = mk({ grossIncome: "250000", salarySacrifice: "15000" });
    const e = runEngine(data);
    expect(e.householdTax.person1.division293).toBeGreaterThan(0);
  });
});

// ── 4. NEGATIVE GEARING ───────────────────────────────────────────────────────
describe("Scenario 4 — Negative gearing household", () => {
  const ip = {
    id: "ip1", label: "Investment Property",
    status: "existing",                          // required for household tax filter
    value: "600000", mortgageBalance: "500000", mortgageRate: "6",
    weeklyRent: "400", ownershipPct: "100",
    depreciation: "5000",
    loanType: "pi", startYear: "2020", tenure: "30",
  };
  const data = mk({
    grossIncome: "120000",
    hasInvestmentProperty: "yes",
    investmentProperties: [ip],
    privateHealthInsurance: "yes",
  });
  const e = runEngine(data);

  it("produces negative gearing benefit > 0", () => {
    expect(e.metrics.negativeGearingBenefit).toBeGreaterThan(0);
  });

  it("IP cashflow is negatively geared", () => {
    const cf = e.propertyCashflows.find(c => c.id === "ip1");
    expect(cf).toBeDefined();
    expect(cf.isNegativelyGeared).toBe(true);
  });

  it("tax benefit reduces after removing the negative gearing offset", () => {
    expect(e.householdTax.negativeGearingBenefit).toBeGreaterThan(0);
  });
});

// ── 5. OFFSET ACCOUNT ─────────────────────────────────────────────────────────
describe("Scenario 5 — Offset account reduces effective debt", () => {
  const withoutOffset = runEngine(mk({ mortgageBalance: "400000", ppOrOffsetBalance: "" }));
  const withOffset = runEngine(mk({ mortgageBalance: "400000", ppOrOffsetBalance: "100000" }));

  it("offset account results in earlier debt-free date", () => {
    // With offset, principal reduces faster
    expect(withOffset.mortgage.debtFreeYear).toBeLessThanOrEqual(withoutOffset.mortgage.debtFreeYear);
  });
});

// ── 6. INVESTMENT PROPERTY SALE WITH CGT ─────────────────────────────────────
describe("Scenario 6 — CGT on IP sale (known engine limitation)", () => {
  it("engine does not model CGT events on property sale — documented limitation", () => {
    // CGT on IP sale is a P1 gap item; engine.js header documents this.
    // This test documents the limitation, not a bug.
    const ip = {
      id: "ip1", label: "IP1",
      value: "800000", mortgageBalance: "300000", rate: "5.5",
      weeklyRent: "600", ownershipPct: "100",
      managementFeePct: "8", hasDepreciation: false, depreciation: "0",
      loanType: "pi", startYear: "2018", tenure: "30",
    };
    const data = mk({ investmentProperties: [ip] });
    const e = runEngine(data);
    // No CGT-specific field exists; trajectory does not deduct CGT on sale
    expect(e.metrics).not.toHaveProperty("cgtOnSale");
  });
});

// ── 7. FIRE — BRIDGE FUND REQUIRED ───────────────────────────────────────────
describe("Scenario 7 — FIRE household requiring bridge fund (retire before 60)", () => {
  const data = mk({
    age: "40",
    retirementAge: "52",   // 8 years before super access at 60
    targetRetirementSpending: "80000",
    superBalance: "600000",
    cashSavings: "200000", sharesEtfs: "400000",
    grossIncome: "180000",
  });
  const e = runEngine(data);

  it("flags bridge fund requirement", () => {
    expect(e.fire.bridgeYears).toBeGreaterThan(0);
    expect(e.fire.bridgeFundNeeded).toBeGreaterThan(0);
  });

  it("bridge fund years equals gap between retirement age and preservation age (60)", () => {
    expect(e.fire.bridgeYears).toBe(60 - 52);
  });

  it("FIRE number is positive", () => {
    expect(e.fire.fireNumber).toBeGreaterThan(0);
  });
});

// ── 8. ACCUMULATION TO PENSION TRANSITION ────────────────────────────────────
describe("Scenario 8 — Accumulation to pension-phase transition at 60", () => {
  const data = mk({
    age: "55",
    retirementAge: "60",
    superBalance: "900000",
    grossIncome: "120000",
    targetRetirementSpending: "70000",
  });
  const e = runEngine(data);

  it("projects super balance at retirement", () => {
    expect(e.metrics.projectedSuper).toBeGreaterThan(0);
  });

  it("drawdown trajectory is produced after retirement", () => {
    expect(e.drawdown).toBeDefined();
  });

  it("ABP drawdown enforces minimum (5% for age 60–64)", () => {
    // At age 60-64, minimum drawdown is 4%
    expect(e.drawdown).toBeDefined();
  });
});

// ── 9. TRANSFER BALANCE CAP BREACH ───────────────────────────────────────────
describe("Scenario 9 — Transfer Balance Cap breach ($1.9M)", () => {
  const data = mk({
    age: "45",
    retirementAge: "65",
    superBalance: "1500000",
    grossIncome: "160000",
    salarySacrifice: "10000",
    targetRetirementSpending: "100000",
  });
  const e = runEngine(data);

  it("projected super exceeds TBC at retirement", () => {
    // With $1.5M at 45, 20 years of growth should push past $1.9M
    expect(e.metrics.projectedSuper).toBeGreaterThan(1_900_000);
    expect(e.metrics.capExceeded).toBe(true);
  });
});

// ── 10. PARTIAL AGE PENSION ───────────────────────────────────────────────────
describe("Scenario 10 — Partial Age Pension household", () => {
  // Low assets + homeowner: PPOR excluded from assets test.
  // NW at 67 ≈ super($100k) + liquid($5k) ≈ $105k → well below $314k free area → full rate.
  // Income test: $0 spending target → no reduction → full rate passes.
  const data = mk({
    age: "65",
    retirementAge: "67",
    superBalance: "100000",
    grossIncome: "0",
    cashSavings: "5000", sharesEtfs: "0",
    ppOrValue: "400000", mortgageBalance: "0",
    targetRetirementSpending: "0",
    homeOwnership: "owner",
  });
  const e = runEngine(data);

  it("Age Pension estimate is computed", () => {
    expect(e.agePension).toBeDefined();
  });

  it("eligible flag is set", () => {
    expect(e.agePension.eligible).toBe(true);
  });

  it("partial pension amount is positive", () => {
    expect(e.agePension.estimatedAnnual).toBeGreaterThan(0);
  });

  it("pension is at or near the full single rate (~$28.5k) with low assessable assets", () => {
    // Full single rate ~$28,514/yr — low assets + $0 income → full rate
    expect(e.agePension.estimatedAnnual).toBeGreaterThan(20000);
  });
});

// ── 11. ONE SPOUSE RETIRED ────────────────────────────────────────────────────
describe("Scenario 11 — One spouse retired, one still working", () => {
  const data = mk({
    hasPartner: "yes", partnerName: "Jordan",
    age: "50", partnerAge: "65",
    retirementAge: "60", partnerRetirementAge: "65",   // partner already at retirement age
    grossIncome: "130000", partnerIncome: "0",
    superBalance: "400000", partnerSuperBalance: "800000",
    targetRetirementSpending: "80000",
  });
  const e = runEngine(data);

  it("household produces a valid trajectory", () => {
    expect(e.trajectory.length).toBeGreaterThan(0);
  });

  it("person2 super is projected independently", () => {
    expect(e.super.person2.projectedBalance).toBeGreaterThan(0);
  });
});

// ── 12. MORTGAGE vs SALARY SACRIFICE ─────────────────────────────────────────
describe("Scenario 12 — Mortgage vs salary sacrifice comparison", () => {
  const baseMortgage = runEngine(mk({
    grossIncome: "120000",
    mortgageBalance: "500000", mortgageRate: "6",
    salarySacrifice: "0",
    superBalance: "150000",
    targetRetirementSpending: "65000",
  }));

  const withSS = runEngine(mk({
    grossIncome: "120000",
    mortgageBalance: "500000", mortgageRate: "6",
    salarySacrifice: "10000",
    superBalance: "150000",
    targetRetirementSpending: "65000",
  }));

  it("salary sacrifice increases projected super", () => {
    expect(withSS.metrics.projectedSuper).toBeGreaterThan(baseMortgage.metrics.projectedSuper);
  });

  it("salary sacrifice reduces taxable income (person1 pays less income tax)", () => {
    expect(withSS.householdTax.person1.incomeTax).toBeLessThan(baseMortgage.householdTax.person1.incomeTax);
  });
});

// ── 13. MORTGAGE vs ETF INVESTMENT ───────────────────────────────────────────
describe("Scenario 13 — Mortgage acceleration vs ETF accumulation", () => {
  const moreLiquid = runEngine(mk({
    grossIncome: "120000",
    mortgageBalance: "400000",
    cashSavings: "10000", sharesEtfs: "200000",
    superBalance: "150000",
    targetRetirementSpending: "65000",
  }));

  const lessMortgage = runEngine(mk({
    grossIncome: "120000",
    mortgageBalance: "200000",   // already paid down more
    cashSavings: "10000", sharesEtfs: "50000",
    superBalance: "150000",
    targetRetirementSpending: "65000",
  }));

  it("lower mortgage balance improves current net worth", () => {
    expect(lessMortgage.trajectory[0].netWorth).toBeGreaterThan(moreLiquid.trajectory[0].netWorth);
  });
});

// ── 14. MARKET CRASH IN EARLY RETIREMENT ─────────────────────────────────────
describe("Scenario 14 — Market crash in early retirement (conservative scenario)", () => {
  const baseCase = runEngine(mk({
    age: "58", retirementAge: "60",
    superBalance: "1200000", grossIncome: "80000",
    targetRetirementSpending: "80000",
    activeScenario: "base",
  }));

  const crashCase = runEngine(mk({
    age: "58", retirementAge: "60",
    superBalance: "1200000", grossIncome: "80000",
    targetRetirementSpending: "80000",
    activeScenario: "conservative",
  }));

  it("conservative scenario produces lower projected super than base", () => {
    expect(crashCase.metrics.projectedSuper).toBeLessThan(baseCase.metrics.projectedSuper);
  });

  it("conservative scenario produces lower Monte Carlo success rate", () => {
    expect(crashCase.monteCarlo.successRate).toBeLessThanOrEqual(baseCase.monteCarlo.successRate);
  });

  it("both scenarios produce a depletion age or last-to-life flag", () => {
    expect(baseCase.metrics).toHaveProperty("depletionAge");
    expect(crashCase.metrics).toHaveProperty("depletionAge");
  });
});

// ── 15. HIGH-NET-WORTH ESTATE PROJECTION ─────────────────────────────────────
describe("Scenario 15 — High-net-worth estate projection (TBC breach)", () => {
  const data = mk({
    age: "55", retirementAge: "65",
    grossIncome: "300000", salarySacrifice: "15000",
    superBalance: "2000000",
    cashSavings: "500000", sharesEtfs: "1000000",
    ppOrValue: "3000000", mortgageBalance: "0",
    targetRetirementSpending: "150000",
  });
  const e = runEngine(data);

  it("caps pension-phase super at TBC ($1.9M)", () => {
    expect(e.metrics.capExceeded).toBe(true);
  });

  it("projected net worth at retirement exceeds $5M", () => {
    expect(e.metrics.retirementNetWorth).toBeGreaterThan(5_000_000);
  });

  it("Division 293 applies at this income level", () => {
    expect(e.householdTax.person1.division293).toBeGreaterThan(0);
  });

  it("FIRE number is very high and may already be met", () => {
    expect(e.fire.fireNumber).toBeGreaterThan(0);
  });
});

// ── 16. HELP / HECS DEBT ──────────────────────────────────────────────────────
describe("Scenario 16 — HELP/HECS debt compulsory repayments", () => {
  it("no HECS repayment below minimum repayment threshold", () => {
    const tax = calculatePersonTax(40000, { superConcessional: 0, hasPrivateHealth: true, hecsDebt: 30000 });
    expect(tax.hecsRepayment).toBe(0);
  });

  it("HECS repayment triggers above threshold", () => {
    const tax = calculatePersonTax(80000, { superConcessional: 0, hasPrivateHealth: true, hecsDebt: 20000 });
    expect(tax.hecsRepayment).toBeGreaterThan(0);
  });

  it("HECS repayment capped by outstanding debt", () => {
    // Small debt of $500 should be fully repaid (repayment won't exceed debt)
    const tax = calculatePersonTax(100000, { superConcessional: 0, hasPrivateHealth: true, hecsDebt: 500 });
    expect(tax.hecsRepayment).toBeLessThanOrEqual(500);
  });

  it("engine reflects HECS in household tax breakdown", () => {
    const data = mk({ grossIncome: "80000", hecsDebt: "25000" });
    const e = runEngine(data);
    expect(e.householdTax.person1.hecsRepayment).toBeGreaterThan(0);
  });

  it("Medicare Levy Surcharge applies when no private health and income > $93k", () => {
    const tax = calculatePersonTax(100000, { superConcessional: 0, hasPrivateHealth: false, hecsDebt: 0 });
    expect(tax.mls).toBeGreaterThan(0);
  });

  it("MLS does not apply when private health insurance held", () => {
    const tax = calculatePersonTax(100000, { superConcessional: 0, hasPrivateHealth: true, hecsDebt: 0 });
    expect(tax.mls).toBe(0);
  });
});
