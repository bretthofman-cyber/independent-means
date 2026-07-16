/**
 * Opportunity-detection engine — pure functions, no React, no side effects.
 *
 * Each detector inspects the user's plan data (and optionally engine output)
 * and returns a structured opportunity object. Add new detectors by following
 * the same shape and appending to runOpportunityDetectors().
 */

import { SUPER } from "./ausConfig.js";
import { FEATURES } from "./features.js";

const p = v => parseFloat(String(v ?? "0").replace(/,/g, "")) || 0;

// Threshold: only flag salary sacrifice if there is at least this much headroom
const SS_MIN_HEADROOM = 1000;
// Threshold: only flag mortgage acceleration above this rate
const MORTGAGE_RATE_THRESHOLD = 5.0;
// ATO threshold for carry-forward cap eligibility
const CARRY_FORWARD_SUPER_CAP = 500_000;
// Minimum mortgage balance worth flagging for debt recycling
const DEBT_RECYCLING_MIN_BALANCE = 50_000;

// ── Detectors ─────────────────────────────────────────────────────────────────

/**
 * a. Salary sacrifice headroom
 * Compares employer SG + current SS against the concessional cap.
 */
export function detectSalarySacrifice(data) {
  const income  = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const sgRate  = (p(data.employerSgRate) || 12) / 100;
  const ss      = p(data.salarySacrifice);
  const sg      = income * sgRate;
  const headroom = Math.max(0, SUPER.concessionalCap - sg - ss);
  const matched = income >= 60_000 && headroom >= SS_MIN_HEADROOM;

  return {
    id: "salary_sacrifice",
    title: "Salary sacrifice headroom",
    description: matched
      ? `$${Math.round(headroom).toLocaleString()} headroom under the $${SUPER.concessionalCap.toLocaleString()} concessional cap. Salary sacrificing more reduces tax while growing super.`
      : "Concessional cap is near or fully utilised at your current income and contribution level.",
    matched,
    featureId: FEATURES.CUSTOM_ASSUMPTIONS,
    priority: 1,
  };
}

/**
 * b. Mortgage payoff acceleration
 * Flags high-rate mortgages where overpayment has material interest savings.
 */
export function detectMortgageAcceleration(data) {
  const balance = p(data.mortgageBalance);
  const rate    = p(data.mortgageRate);
  const matched = balance > 10_000 && rate >= MORTGAGE_RATE_THRESHOLD;

  return {
    id: "mortgage_acceleration",
    title: "Mortgage payoff acceleration",
    description: matched
      ? `Mortgage of $${Math.round(balance).toLocaleString()} at ${rate}%. Overpayment scenarios show how much interest can be saved and years removed.`
      : "No high-rate mortgage detected. Acceleration modelling is not applicable.",
    matched,
    featureId: FEATURES.DEBT_RECYCLING,
    priority: 3,
  };
}

/**
 * c. Carry-forward concessional cap
 * ATO allows catch-up contributions when super balance is under $500k.
 */
export function detectCarryForwardCap(data) {
  const superBal = p(data.superBalance);
  const matched  = superBal > 0 && superBal < CARRY_FORWARD_SUPER_CAP;

  return {
    id: "carry_forward_cap",
    title: "Carry-forward concessional cap",
    description: matched
      ? `Super balance of $${Math.round(superBal).toLocaleString()} is under the $500k threshold. Unused cap from prior years may be available for a one-off tax-saving contribution.`
      : superBal >= CARRY_FORWARD_SUPER_CAP
        ? "Super balance above $500k. Carry-forward cap is not available."
        : "Enter a super balance to check carry-forward eligibility.",
    matched,
    featureId: FEATURES.CARRY_FORWARD_CAP,
    priority: 2,
  };
}

/**
 * d. Retirement age optimisation
 * Always available when a super projection exists; personalised with the number.
 */
export function detectRetirementAgeOptimisation(data, engine = null) {
  const retAge  = parseInt(data.retirementAge || "65");
  const projected = engine?.metrics?.projectedSuper ?? 0;
  const matched = projected > 0 || (p(data.superBalance) > 0 && p(data.grossIncome) > 0);

  const projStr = projected > 0
    ? `$${(projected / 1e6).toFixed(1)}m projected`
    : "projection available";

  return {
    id: "retirement_age",
    title: "Retirement age optimisation",
    description: matched
      ? `Retiring at ${retAge} puts ${projStr}. Model the crossover: how retiring 1 to 3 years earlier or later shifts your outcome.`
      : "Enter income and super details to model retirement age scenarios.",
    matched,
    featureId: FEATURES.CUSTOM_ASSUMPTIONS,
    priority: 4,
  };
}

/**
 * e. Monte Carlo success analysis
 * Always available when the user has set a retirement spending target.
 */
export function detectMonteCarloAnalysis(data) {
  const target  = p(data.targetRetirementSpending);
  const matched = target > 0;

  return {
    id: "monte_carlo",
    title: "Retirement probability analysis",
    description: matched
      ? `Model 1,000 market scenarios to find the probability that a $${Math.round(target).toLocaleString()} annual spending target is sustainable to age ${data.lifeExpectancy || 90}.`
      : "Enter a retirement spending target in Stage 5 to unlock probability analysis.",
    matched,
    featureId: FEATURES.PROBABILITY_VIEW,
    priority: 5,
  };
}

/**
 * f. Debt recycling scenario
 * Flags plans where there is both a mortgage and investment assets — the
 * combination is a debt recycling candidate.
 */
export function detectDebtRecycling(data) {
  const balance  = p(data.mortgageBalance);
  const shares   = p(data.sharesEtfs) + p(data.managedFunds);
  const hasIP    = data.hasInvestmentProperty === "yes";
  const matched  = balance >= DEBT_RECYCLING_MIN_BALANCE && (shares > 0 || hasIP);

  return {
    id: "debt_recycling",
    title: "Debt recycling scenario",
    description: matched
      ? `Mortgage of $${Math.round(balance).toLocaleString()} with existing investment assets. Debt recycling may convert non-deductible interest into a tax deduction while building wealth.`
      : "Debt recycling requires both a mortgage and investment assets. No candidate detected.",
    matched,
    featureId: FEATURES.DEBT_RECYCLING,
    priority: 6,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run all detectors and return a sorted array of opportunity objects.
 * @param {object} data   - flat user plan data (EMPTY_DATA shape)
 * @param {object|null} engine - runEngine() output, or null if not yet run
 */
export function runOpportunityDetectors(data, engine = null) {
  return [
    detectSalarySacrifice(data),
    detectCarryForwardCap(data),
    detectMortgageAcceleration(data),
    detectRetirementAgeOptimisation(data, engine),
    detectMonteCarloAnalysis(data),
    detectDebtRecycling(data),
  ].sort((a, b) => a.priority - b.priority);
}
