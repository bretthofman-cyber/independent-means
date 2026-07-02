/**
 * Action Plan — deterministic, factual, advice-free.
 *
 * Each item presents a calculation or observation derived from the engine.
 * No recommendations are made. Language is modelling-first ("based on inputs",
 * "modelling estimates", "appears to") with adviser referral where appropriate.
 *
 * AFSL position: general information only. Nothing here constitutes personal
 * financial advice. See ASIC RG 255 compliance notes in CLAUDE.md.
 */

const p = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const fmt = n => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export const PLAN_CATEGORIES = {
  retirement: { label: "Retirement readiness",            icon: "🎯" },
  super:      { label: "Superannuation & contributions",  icon: "📈" },
  tax:        { label: "Tax position",                    icon: "📋" },
  property:   { label: "Property & debt",                 icon: "🏠" },
  cash:       { label: "Cash & liquidity",                icon: "💧" },
  estate:     { label: "Insurance & estate planning",     icon: "📄" },
};

/**
 * Generate all plan items for the current plan.
 * @param {object} data    Raw user data from EMPTY_DATA
 * @param {object} engine  Output of runEngine(data)
 * @returns {object[]}     Flat array of plan items, ordered by category and priority
 */
export function generatePlanItems(data, engine) {
  if (!engine) return [];

  const items = [];
  const add = (category, priority, id, title, body, footnote = null) =>
    items.push({ category, priority, id, title, body, footnote });

  const m    = engine.metrics;
  const mc   = engine.monteCarlo;
  const ht   = engine.householdTax;
  const ap   = engine.agePension;
  const mort = engine.mortgage;
  const isCouple = data.hasPartner === "yes";
  const retirementAge = p(data.retirementAge) || 65;
  const lifeExp = p(data.lifeExpectancy) || 90;

  // ── RETIREMENT READINESS ─────────────────────────────────────────────────────

  if (m) {
    if (!m.lastsToLifeExpectancy && m.depletionAge) {
      const gap = lifeExp - m.depletionAge;
      add("retirement", 1, "DEPLETION",
        "Projected asset depletion before assumed life expectancy",
        `Based on current scenario assumptions, modelling estimates retirement assets may be exhausted at age ${m.depletionAge} — approximately ${gap} year${gap !== 1 ? "s" : ""} before the assumed life expectancy of age ${lifeExp}. The Monte Carlo simulation estimates a ${mc?.successRate ?? "—"}% probability of funding expenses to the assumed life expectancy.`,
        "Adjusting the retirement spending target, savings rate, retirement age, or return scenario in the Analysis screen will update this projection."
      );
    } else if (mc && mc.successRate >= 75) {
      add("retirement", 3, "ON_TRACK",
        "Retirement funding projection — current scenario",
        `Based on current assumptions, modelling projects retirement assets sufficient to fund the target spending to age ${lifeExp}. The Monte Carlo simulation estimates a ${mc.successRate}% probability of this outcome across 1,000 simulations.`,
        "These are scenario projections based on assumptions that may differ materially from actual outcomes. Past performance is not a reliable indicator of future performance."
      );
    }

    if (m.projectedSuper && m.requiredSuper) {
      const diff = m.projectedSuper - m.requiredSuper;
      const isSurplus = diff > 0;
      add("retirement", isSurplus ? 3 : 2, "SUPER_BALANCE_VS_REQUIRED",
        "Projected super balance vs. estimated required balance at retirement",
        `The modelled super balance at retirement age ${retirementAge} is ${fmt(m.projectedSuper)}. The estimated balance required to fund the entered retirement spending target is ${fmt(m.requiredSuper)}, indicating an estimated ${isSurplus ? "surplus" : "shortfall"} of ${fmt(Math.abs(diff))}.`,
        "Required balance is calculated from the target spending amount and the selected Safe Withdrawal Rate. It does not incorporate Age Pension entitlement."
      );
    }

    if (ap?.eligible && ap.estimatedAnnual > 0) {
      add("retirement", 3, "AGE_PENSION",
        "Partial Age Pension eligibility estimated",
        `Based on projected retirement assets, a partial Age Pension of approximately ${fmt(ap.estimatedAnnual)}/yr is estimated at age ${Math.max(retirementAge, 67)} under the assets and income tests currently in effect.`,
        "Actual entitlement is assessed by Services Australia and depends on the assets test, income test (including deemed returns on financial assets), marital status, and other rules not fully modelled here. This estimate is illustrative only."
      );
    }

    if (mort?.debtFreeYear && !isNaN(mort.debtFreeYear) && mort.debtFreeYear > new Date().getFullYear()) {
      const yearsToFree = mort.debtFreeYear - new Date().getFullYear();
      add("retirement", 3, "DEBT_FREE",
        "PPOR mortgage payoff — projected year",
        `Based on P&I repayments of approximately ${fmt((mort.monthlyPayment || 0) * 12)}/yr and the entered mortgage balance, the PPOR mortgage is projected to be repaid in ${mort.debtFreeYear} (approximately ${yearsToFree} year${yearsToFree !== 1 ? "s" : ""} from now).`,
        null
      );
    }
  }

  // ── SUPERANNUATION & CONTRIBUTIONS ───────────────────────────────────────────

  const gross1 = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const sg1    = gross1 * ((p(data.employerSgRate) || 12) / 100);
  const ss1    = p(data.salarySacrifice);
  const cfCap1 = p(data.carryForwardCap);
  const superBal1 = p(data.superBalance);
  const effectiveCap1 = superBal1 < 500_000 ? 30_000 + cfCap1 : 30_000;
  const capRoom1 = Math.max(0, effectiveCap1 - (sg1 + ss1));

  if (capRoom1 > 2_000 && gross1 > 0) {
    add("super", 2, "CAP_ROOM",
      "Estimated unused concessional contribution capacity",
      `Based on inputs entered, approximately ${fmt(Math.round(capRoom1))} of the annual concessional contribution cap appears unused this financial year (estimated SG: ${fmt(Math.round(sg1))}, salary sacrifice entered: ${fmt(ss1)}, effective cap: ${fmt(Math.round(effectiveCap1))}).`,
      "Concessional contributions include superannuation guarantee, salary sacrifice, and personal deductible contributions. Legislative conditions and individual circumstances determine actual eligibility. You may wish to seek professional advice regarding contribution strategies."
    );
  }

  if (isCouple) {
    const gross2 = p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome);
    const sg2    = gross2 * ((p(data.partnerEmployerSgRate) || 12) / 100);
    const ss2    = p(data.partnerSalarySacrifice);
    const cfCap2 = p(data.partnerCarryForwardCap);
    const superBal2 = p(data.partnerSuperBalance);
    const effectiveCap2 = superBal2 < 500_000 ? 30_000 + cfCap2 : 30_000;
    const capRoom2 = Math.max(0, effectiveCap2 - (sg2 + ss2));
    const partnerName = data.partnerName || "Partner";
    if (capRoom2 > 2_000 && gross2 > 0) {
      add("super", 2, "CAP_ROOM_2",
        `${partnerName} — estimated unused concessional contribution capacity`,
        `Based on inputs entered, approximately ${fmt(Math.round(capRoom2))} of the annual concessional contribution cap appears unused for ${partnerName} this financial year (estimated SG: ${fmt(Math.round(sg2))}, salary sacrifice entered: ${fmt(ss2)}, effective cap: ${fmt(Math.round(effectiveCap2))}).`,
        "You may wish to seek professional advice regarding contribution strategies. Verify via ATO online services."
      );
    }
  }

  if (cfCap1 > 0 && superBal1 < 500_000) {
    add("super", 2, "CARRY_FORWARD",
      "Carry-forward concessional cap balance entered",
      `An estimated carry-forward concessional amount of ${fmt(cfCap1)} has been entered, raising the effective cap to ${fmt(effectiveCap1)} for this financial year. Carry-forward balances accumulate from unused cap amounts over up to 5 prior financial years where the prior 30 June super balance was below $500,000.`,
      "Verify your exact carry-forward balance via ATO online services (myGov). Unused carry-forward from a given year expires after 5 years. Legislative eligibility conditions apply."
    );
  }

  if (m?.capExceeded) {
    add("super", 1, "CAP_EXCEEDED",
      "Concessional contribution cap appears exceeded",
      `Based on inputs entered, total estimated concessional contributions appear to exceed the annual cap of $30,000. Contributions above the cap are included in assessable income and taxed at the marginal rate, less a 15% tax offset.`,
      "Excess concessional contributions are reported by the ATO via an excess concessional contributions determination. Professional advice is recommended if this applies."
    );
  }

  if (m?.projectedSuper > 1_800_000) {
    add("super", 2, "TBC",
      "Projected super balance approaches Transfer Balance Cap",
      `The modelled super balance at retirement (${fmt(m.projectedSuper)}) approaches or exceeds the Transfer Balance Cap of $1,900,000. The TBC is the limit on amounts that can be transferred to the tax-free retirement (pension) phase.`,
      "Amounts above the TBC at retirement remain in the accumulation phase, subject to 15% earnings tax. Strategies for managing balances above the TBC involve complex structuring — professional advice is recommended."
    );
  }

  const div293Total = (ht?.person1?.div293Tax || 0) + (ht?.person2?.div293Tax || 0);
  if (div293Total > 0) {
    add("super", 3, "DIV293",
      "Division 293 additional contributions tax estimated",
      `Income above $250,000 attracts an additional 15% tax on concessional superannuation contributions (Division 293). Based on income entered, an estimated ${fmt(div293Total)}/yr in additional contributions tax is included in the household tax calculation.`,
      null
    );
  }

  // ── TAX POSITION ─────────────────────────────────────────────────────────────

  const fcTotal = p(data.frankingCredits) + p(data.partnerFrankingCredits);
  if (fcTotal > 0) {
    const fcRefund = ht?.frankingCreditRefund || 0;
    const fcApplied = fcTotal - fcRefund;
    add("tax", 3, "FRANKING",
      "Franking credits included in tax calculation",
      `Dividend imputation (franking) credits of ${fmt(fcTotal)}/yr are included in the tax model. Of this, an estimated ${fmt(fcApplied)} offsets income tax payable.${fcRefund > 0 ? ` An estimated ${fmt(fcRefund)} represents excess credits — under current legislation, excess franking credits are generally refundable to eligible taxpayers.` : ""}`,
      "Franking credit amounts and refundability are subject to individual circumstances and ATO eligibility rules. Verify against your dividend statements and prior tax returns."
    );
  }

  const ngBenefit = m?.negativeGearingBenefit || 0;
  if (ngBenefit > 0) {
    add("tax", 3, "NEG_GEAR",
      "Investment property tax effect modelled",
      `Based on entered rental income and estimated expenses, investment property losses reduce estimated household income tax by approximately ${fmt(ngBenefit)}/yr in the current projection.`,
      "Actual tax impact depends on rental income, deductible expenses, depreciation claims, and the owner's marginal tax rate in the income year. Depreciation is not modelled in this tool."
    );
  }

  const hecsTotal = p(data.hecsDebt) + (isCouple ? p(data.partnerHecsDebt) : 0);
  if (hecsTotal > 0) {
    const hecsRepay1 = ht?.person1?.hecsRepayment || 0;
    const hecsRepay2 = ht?.person2?.hecsRepayment || 0;
    const hecsRepayTotal = hecsRepay1 + hecsRepay2;
    add("tax", 3, "HECS",
      "HECS/HELP liability entered",
      `A HECS/HELP balance of ${fmt(hecsTotal)} is entered.${hecsRepayTotal > 0 ? ` Based on income entered, estimated compulsory repayments of approximately ${fmt(hecsRepayTotal)}/yr are included in the tax model.` : ""} HECS/HELP debt is indexed annually to CPI; this projection does not model future indexation.`,
      null
    );
  }

  const annualTax = ht ? ht.totalHouseholdTax : 0;
  if (annualTax > 0) {
    add("tax", 3, "HOUSEHOLD_TAX",
      "Estimated household tax — current year",
      `Based on income, deductions, and tax offsets entered, estimated total household income tax (including Medicare Levy) is approximately ${fmt(annualTax)}/yr. This includes income tax, Medicare Levy, HECS repayments, and Division 293 where applicable. It excludes GST and stamp duty.`,
      "Tax estimates are based on FY2026-27 rates and the information entered. Actual tax is assessed by the ATO based on your tax return."
    );
  }

  // ── PROPERTY & DEBT ──────────────────────────────────────────────────────────

  if (data.debtRecycling === true || data.debtRecycling === "true") {
    const mortBal  = p(data.mortgageBalance);
    const mortRate = p(data.mortgageRate);
    add("property", 2, "DEBT_RECYCLING",
      "Debt recycling scenario modelled",
      `Debt recycling is enabled in this projection. The strategy converts non-deductible PPOR mortgage interest to deductible investment loan interest by redrawing funds used to invest. Based on the entered mortgage balance (${fmt(mortBal)}) and interest rate (${mortRate}%), modelling estimates a cumulative annual tax position improvement over the pre-retirement projection period.`,
      "These figures are illustrative only. Debt recycling involves specific financial, legal, and tax structures — including investment loans and asset selection decisions. This does not constitute a recommendation to implement this strategy."
    );
  }

  const existingIPs = (data.investmentProperties || []).filter(ip => ip.status === "existing");
  if (existingIPs.length > 0 && engine.propertyCashflows?.ips) {
    for (const cf of engine.propertyCashflows.ips) {
      if (!cf || typeof cf.netCashflow !== "number") continue;
      const ip = existingIPs.find(i => i.id === cf.id);
      if (!ip) continue;
      const label = ip.label || "Investment Property";
      const sign  = cf.netCashflow >= 0 ? "positive" : "negative";
      add("property", 3, `IP_CF_${cf.id}`,
        `${label} — estimated cashflow position`,
        `Based on entered rental income and estimated running costs, ${label} has an estimated net cashflow of ${fmt(Math.abs(cf.netCashflow))}/yr (${sign} gearing) before income tax effects. This estimate excludes depreciation, which may affect the actual tax position.`,
        null
      );
    }
  }

  const consumerDebt = p(data.creditCardDebt) + p(data.personalLoanDebt) +
    (isCouple ? p(data.partnerCreditCardDebt) + p(data.partnerPersonalLoanDebt) : 0);
  if (consumerDebt > 0) {
    add("property", 2, "CONSUMER_DEBT",
      "Non-mortgage consumer debt entered",
      `Non-mortgage consumer debt of ${fmt(consumerDebt)} is entered (credit cards and personal loans). This is included in current net worth calculations but is not projected forward in the net worth trajectory.`,
      null
    );
  }

  // ── CASH & LIQUIDITY ─────────────────────────────────────────────────────────

  const emergency  = p(data.emergencyFund);
  const monthlyExp = p(data.monthlyExpenses);
  if (monthlyExp > 0) {
    const months  = emergency / monthlyExp;
    const rounded = Math.round(months * 10) / 10;
    const priority = months < 1 ? 1 : months < 3 ? 2 : 3;
    add("cash", priority, "EMERGENCY",
      "Emergency fund — estimated months of expenses",
      `Based on entered monthly expenses of ${fmt(monthlyExp)}/mo, the current emergency fund of ${fmt(emergency)} represents approximately ${rounded} month${rounded !== 1 ? "s" : ""} of living expenses. Financial planning resources commonly reference 3–6 months of expenses as a benchmark for an emergency reserve.`,
      null
    );
  }

  // ── INSURANCE & ESTATE ───────────────────────────────────────────────────────

  add("estate", 3, "INSURANCE",
    "Insurance coverage — not modelled",
    "This planner does not model life insurance, income protection, or total and permanent disability coverage. These are commonly held inside or outside superannuation. A gap in coverage may materially affect financial outcomes in the event of illness, injury, or death.",
    "Discuss insurance needs with a licensed financial adviser (AFSL holder)."
  );

  add("estate", 3, "ESTATE",
    "Superannuation and estate planning",
    "Superannuation does not automatically form part of a deceased estate. A binding death benefit nomination directs super benefits to intended beneficiaries outside the provisions of a will. Estate planning documents typically include a will, enduring power of attorney, and superannuation beneficiary nominations.",
    "Estate planning involves legal documents prepared by a solicitor. Superannuation beneficiary nominations are managed through your superannuation fund."
  );

  return items;
}
