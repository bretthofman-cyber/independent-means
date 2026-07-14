/**
 * Warnings Engine — deterministic, template-driven, advice-free.
 *
 * Returns typed warnings generated from rules and thresholds.
 * Never uses generative AI. Never recommends products or strategies.
 * Every message is a factual observation or contextual note.
 *
 * Severity levels:
 *   critical  — materially affects retirement outcome; must be surfaced
 *   high      — significant financial risk or regulatory flag
 *   medium    — planning opportunity or moderate risk
 *   info      — contextual note; positive or neutral
 */

const p = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

const fmt = n => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const fmtK = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}m` : `$${Math.round(n / 1000)}k`;

export const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, info: 1 };

/**
 * @typedef {{ id: string, severity: "critical"|"high"|"medium"|"info", title: string, message: string, hint: string }} Warning
 */

/**
 * Generate all applicable warnings for the current plan.
 *
 * @param {object} data    Raw user data from EMPTY_DATA
 * @param {object} engine  Output of runEngine(data)
 * @returns {Warning[]}    Sorted critical → info
 */
export function generateWarnings(data, engine) {
  if (!engine) return [];

  const warnings = [];
  const add = (severity, id, title, message, hint = "") =>
    warnings.push({ severity, id, title, message, hint });

  const m    = engine.metrics;
  const mc   = engine.monteCarlo;
  const mort = engine.mortgage;
  const ht   = engine.householdTax;
  const fire = engine.fire;
  const ap   = engine.agePension;
  const isCouple = data.hasPartner === "yes";

  const retirementAge = p(data.retirementAge) || 65;
  const lifeExp       = p(data.lifeExpectancy) || 90;
  const hasTarget     = p(data.targetRetirementSpending) > 0;
  const currentYear   = new Date().getFullYear();

  // ────────────────────────────────────────────────────────────────────────────
  // CRITICAL
  // ────────────────────────────────────────────────────────────────────────────

  if (hasTarget && m && !m.lastsToLifeExpectancy && m.depletionAge) {
    const shortfall = lifeExp - m.depletionAge;
    add("critical", "DEPLETION",
      "Retirement funds projected to run out",
      `This scenario projects assets exhausted at age ${m.depletionAge} — ${shortfall} year${shortfall !== 1 ? "s" : ""} before the life expectancy of ${lifeExp} entered.`,
      "Key modelling levers are contribution rates, retirement date, spending target, and scenario assumptions — adjusting these inputs will update this projection."
    );
  }

  if (hasTarget && mc && mc.successRate < 50) {
    add("critical", "LOW_SUCCESS_PROB",
      "Less than 50% probability of funding full retirement",
      `Across ${mc.iterations.toLocaleString()} simulations, only ${mc.successRate}% project that assets last to age ${lifeExp}.`,
      "Scenario inputs, contribution rates, and spending target are the primary modelling levers — adjusting these will update the projected outcome."
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HIGH
  // ────────────────────────────────────────────────────────────────────────────

  // Transfer Balance Cap breach
  if (m?.capExceeded) {
    add("high", "TBC_BREACH",
      "Projected super exceeds Transfer Balance Cap",
      `Projected retirement super of ${fmtK(m.projectedSuper)} exceeds the $1.9m Transfer Balance Cap. Excess of ${fmtK(m.projectedSuper - 1_900_000)} must remain in accumulation phase (earnings taxed at 15%).`,
      "Pension-phase structuring above the TBC warrants specialist advice. This projection does not separately model the tax drag on excess accumulation."
    );
  }

  // Bridge fund required
  if (retirementAge < 60) {
    const bridgeYears = 60 - retirementAge;
    const bridgeEst   = fire?.bridgeFundNeeded || 0;
    add("high", "BRIDGE_FUND_REQUIRED",
      `${bridgeYears}-year gap before super access`,
      `Planned retirement at ${retirementAge} is ${bridgeYears} year${bridgeYears !== 1 ? "s" : ""} before the super preservation age of 60. Super cannot be accessed until a condition of release is met.`,
      bridgeEst > 0
        ? `This scenario estimates approximately ${fmt(bridgeEst)} of non-super liquid assets would be needed to bridge the gap at the current spending target.`
        : "Non-super liquid assets (shares, savings) are needed to cover spending until super access. Enter a retirement spending target to estimate the bridge fund size."
    );
  }

  // Concessional cap breach
  const gross1  = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const sgRate1 = (p(data.employerSgRate) || 12) / 100;
  const sg1     = gross1 * sgRate1;
  const ss1     = p(data.salarySacrifice);
  if (sg1 + ss1 > 30_000) {
    add("high", "CONC_CAP_BREACH",
      "Concessional contributions may exceed the $30,000 cap",
      `Combined employer SG (${fmt(Math.round(sg1))}) and salary sacrifice (${fmt(p(data.salarySacrifice))}) total ${fmt(Math.round(sg1 + ss1))}/yr — above the $30,000 concessional cap.`,
      "Excess concessional contributions are included in assessable income and taxed at the marginal rate, with a 15% offset. Verify actual contribution amounts with your super fund and payroll."
    );
  }

  if (isCouple) {
    const gross2  = p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome);
    const sgRate2 = (p(data.partnerEmployerSgRate) || 12) / 100;
    const sg2     = gross2 * sgRate2;
    const ss2     = p(data.partnerSalarySacrifice);
    if (sg2 + ss2 > 30_000) {
      const partner = data.partnerName || "Partner";
      add("high", "PARTNER_CONC_CAP_BREACH",
        `${partner}'s concessional contributions may exceed the $30,000 cap`,
        `Combined employer SG (${fmt(Math.round(sg2))}) and salary sacrifice (${fmt(p(ss2))}) for ${partner} total ${fmt(Math.round(sg2 + ss2))}/yr.`,
        "Excess concessional contributions are taxed at the marginal rate. Verify actual contribution amounts with your super fund and payroll."
      );
    }
  }

  // MLS
  const mls1 = ht?.person1?.mls || 0;
  const mls2 = ht?.person2?.mls || 0;
  if (mls1 + mls2 > 0) {
    add("high", "MLS_EXPOSURE",
      "Medicare Levy Surcharge applies",
      `${fmt(mls1 + mls2)}/yr Medicare Levy Surcharge is modelled because one or more household members do not have hospital-level private health insurance.`,
      "The MLS ranges from 1.0–1.5% of income. Comparing the annual premium of a hospital-only policy against the MLS amount may be worthwhile, particularly above $93,000 taxable income."
    );
  }

  // Low Monte Carlo success
  if (hasTarget && mc && mc.successRate >= 50 && mc.successRate < 70) {
    add("high", "MODERATE_SUCCESS_PROB",
      "Moderate retirement success probability",
      `${mc.successRate}% of simulations project assets lasting to age ${lifeExp}. This scenario sits below a commonly targeted 70–85% confidence threshold.`,
      "A range of modelling levers — contribution amounts, retirement timing, spending target, and investment return assumptions — may improve this outcome."
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MEDIUM
  // ────────────────────────────────────────────────────────────────────────────

  // Division 293
  const d293 = (ht?.person1?.division293 || 0) + (ht?.person2?.division293 || 0);
  if (d293 > 0) {
    add("medium", "DIV293",
      "Division 293 tax applies",
      `An additional ${fmt(d293)}/yr Division 293 tax applies because combined income and super contributions exceed $250,000.`,
      "Division 293 can be paid personally (ATO invoice) or from the super fund. Salary packaging or timing of contributions may affect exposure. This modelling treats it as a personal cash outflow."
    );
  }

  // HECS at high income
  const hecs1 = p(data.hecsDebt);
  const hecs2 = isCouple ? p(data.partnerHecsDebt) : 0;
  if ((hecs1 + hecs2 > 0) && gross1 > 100_000) {
    add("medium", "HECS_REPAYMENT",
      "HECS-HELP repayments affect take-home pay",
      `Compulsory HECS repayments of ${fmt(ht?.person1?.hecsRepayment || 0)}/yr are deducted via the tax system. These reduce cashflow available for saving and investing.`,
      "HELP debt is indexed to CPI (with caps introduced since 2023). Voluntary repayments reduce the debt but do not reduce compulsory repayment rates and historically offer limited financial advantage."
    );
  }

  // IO mortgage with no expiry set
  if (mort?.type === "io" && !mort.ioExpiryYear) {
    add("medium", "IO_NO_EXPIRY",
      "Interest-only loan: no P&I reversion date set",
      "The PPOR mortgage is marked as interest-only but no reversion year has been entered. The principal balance does not reduce in this projection.",
      "Enter the IO expiry year to model the payment step-up and correct debt trajectory."
    );
  }

  // Sequencing risk (retiring with low buffer)
  if (hasTarget && retirementAge <= p(data.age) + 5 && mc?.successRate && mc.successRate < 85) {
    add("medium", "SEQUENCING_RISK",
      "Early retirement creates sequencing risk",
      "Retiring within 5 years with a sub-85% success probability increases exposure to sequence-of-returns risk: a market downturn in the early retirement years can permanently impair the portfolio.",
      "This scenario is informational only. Spending flexibility in early retirement or a cash buffer may reduce sequencing risk."
    );
  }

  // No super data entered
  if (!p(data.superBalance) && !p(data.grossIncome)) {
    add("medium", "NO_INCOME_ENTERED",
      "No income or super data entered",
      "Retirement projections require at least a gross income or current super balance. Core metrics cannot be calculated without these inputs.",
      "Complete Stages 2 and 5 to unlock retirement modelling."
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // INFO
  // ────────────────────────────────────────────────────────────────────────────

  // Concessional cap headroom
  const concRoom = Math.max(0, 30_000 - sg1 - ss1);
  if (concRoom > 5_000 && p(data.superBalance) > 0) {
    add("info", "CONC_CAP_ROOM",
      "Concessional contribution capacity available",
      `Approximately ${fmt(Math.round(concRoom))}/yr of concessional cap space remains unused (SG: ${fmt(Math.round(sg1))}, salary sacrifice: ${fmt(p(data.salarySacrifice))}, cap: $30,000).`,
      "Salary sacrificing within this limit reduces taxable income and compounds within super at the 15% contributions tax rate rather than the marginal rate."
    );
  }

  // Partial Age Pension
  if (ap?.eligible && ap.estimatedAnnual > 0) {
    add("info", "AGE_PENSION_ELIGIBLE",
      "Partial Age Pension modelled",
      `Based on projected retirement assets, a partial Age Pension of approximately ${fmt(ap.estimatedAnnual)}/yr is estimated at age ${Math.max(retirementAge, 67)} (${ap.reason}).`,
      "Actual entitlement is assessed by Services Australia based on the assets test, income test (including deemed returns on financial assets), and other rules not modelled here. This is illustrative only."
    );
  }

  // Negative gearing benefit
  const ngBenefit = m?.negativeGearingBenefit || 0;
  if (ngBenefit > 0) {
    add("info", "NEGATIVE_GEARING",
      "Negative gearing reduces household tax",
      `Investment property losses reduce estimated household tax by approximately ${fmt(ngBenefit)}/yr in this projection.`,
      "Negative gearing benefit depends on rental income, expenses, depreciation, and each owner's marginal tax rate. This estimate is based on the figures entered and current rates."
    );
  }

  // Franking credits
  const fc1 = p(data.frankingCredits);
  const fc2 = p(data.partnerFrankingCredits);
  const fcTotal = fc1 + fc2;
  const fcRefund = ht?.frankingCreditRefund || 0;
  if (fcTotal > 0) {
    add("info", "FRANKING_CREDITS",
      "Franking credits included in tax calculation",
      `${fmt(fcTotal)}/yr in franking credits offsets income tax.${fcRefund > 0 ? ` ${fmt(fcRefund)} in excess credits is modelled as an ATO refund added to savings.` : ""}`,
      "Dividend imputation credits reduce tax payable dollar-for-dollar. Since 2001, excess credits are refundable by the ATO for most taxpayers. Check dividend statements for the grossed-up dividend and franking credit amounts."
    );
  }

  // Carry-forward concessional contributions
  const cfCap = p(data.carryForwardCap) + p(data.partnerCarryForwardCap);
  const superBal = p(data.superBalance);
  if (cfCap > 0 && superBal < 500_000) {
    add("info", "CARRY_FORWARD",
      "Carry-forward concessional cap available",
      `${fmt(cfCap)} in unused concessional cap is available to contribute above the $30,000/yr standard cap (prior-year super balance under $500,000).`,
      "Carry-forward amounts accumulate over up to 5 prior financial years. Verify your exact available amount via ATO online services (myGov). Consult a tax adviser before making large concessional contributions."
    );
  }

  // TTR opportunity
  const ttr = engine.ttr;
  if (ttr?.eligible && !ttr?.capAlreadyMaxed && ttr.annualTaxBenefit > 500) {
    const fmt2 = v => "$" + Math.round(v).toLocaleString();
    add("info", "TTR_OPPORTUNITY",
      "Transition to Retirement (TTR) strategy available",
      `At age ${ttr.currentAge} you are past preservation age (60) and still working. A TTR strategy could allow an additional ${fmt2(ttr.effectiveAdditionalSS)}/yr in salary sacrifice — saving an estimated ${fmt2(ttr.annualTaxBenefit)}/yr in income tax (${Math.round(ttr.marginalRate * 100)}% marginal rate vs 15% contributions tax). A TTR pension drawn from your super can offset the reduction in take-home pay. Over ${ttr.yearsOfTTR} years to retirement this could add approximately ${fmt2(ttr.cumulativeTaxBenefit)} in cumulative tax savings.`,
      "TTR pensions are tax-free after age 60. The drawdown must be between 4% and 10% of the account balance each year. This is general information only — TTR structuring involves your specific fund's rules and your personal tax position. Consult a licensed financial adviser (AFSL holder) before implementing."
    );
  }

  // Debt recycling
  if ((data.debtRecycling === true || data.debtRecycling === "true") && p(data.mortgageBalance) > 0) {
    const mortgageRate = p(data.mortgageRate);
    add("info", "DEBT_RECYCLING",
      "Debt recycling modelled",
      `Debt recycling is enabled. The annual tax saving from deductible investment debt is added to projected liquid savings each year until retirement or the mortgage is repaid (mortgage rate: ${mortgageRate}%).`,
      "Debt recycling does not reduce your mortgage balance — it converts non-deductible PPOR debt to deductible investment debt. The benefit is the tax deduction on investment interest. This strategy has specific legal and tax requirements; consult a qualified tax adviser."
    );
  }

  // On track positive
  if (hasTarget && m?.onTrack && m.lastsToLifeExpectancy && mc && mc.successRate >= 85) {
    add("info", "ON_TRACK",
      "Projected to fund full retirement under this scenario",
      `Super and investments are projected to cover spending to age ${lifeExp} with a ${mc.successRate}% Monte Carlo success rate — above the 85% commonly cited threshold.`,
      "These are scenario estimates based on assumptions that may not reflect actual market conditions. This information does not constitute advice."
    );
  }

  return warnings.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));
}
