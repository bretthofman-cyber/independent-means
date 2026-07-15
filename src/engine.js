/**
 * Independent Means Calculation Engine
 *
 * All monetary inputs are strings; parse with p() before arithmetic.
 * Australian-specific thresholds live in ausConfig.js — update there annually.
 *
 * Simplifications to be aware of:
 *   • Tax projections use current-year rates; brackets are not inflation-adjusted forward.
 *   • Super returns are pre-tax (accumulation phase 15% earnings tax is not explicitly modelled
 *     — it is implicitly lower than after-tax returns and the user can adjust the return rate).
 *   • Age Pension estimates use current rules and ignore future policy changes.
 *   • HECS debt does not index in projections (indexation paused/capped; conservative approach).
 *   • Carry-forward concessional cap raises effective cap in current year only; future years use standard cap.
 *   • CGT on IP sale uses a flat 30% marginal rate estimate; actual rate depends on total income in sale year.
 */

import {
  INCOME_TAX_BRACKETS, LITO, MEDICARE, MLS_BRACKETS,
  HELP_THRESHOLDS, DIV_293, SUPER, ABP_DRAWDOWN, AGE_PENSION,
} from "./ausConfig.js";
import { indexEventsByYear, getYearEventAdjustments } from "./lifeEvents.js";

// ── PLANNING SCENARIOS ────────────────────────────────────────────────────────

export const DEFAULT_SCENARIOS = {
  base:         { returnRate: 6.5, inflation: 2.5, propertyGrowth: 4.5, rentalGrowth: 3.0, safeWithdrawal: 4.0 },
  conservative: { returnRate: 5.5, inflation: 3.0, propertyGrowth: 3.5, rentalGrowth: 2.5, safeWithdrawal: 4.0 },
  aggressive:   { returnRate: 7.5, inflation: 2.0, propertyGrowth: 5.5, rentalGrowth: 3.5, safeWithdrawal: 4.0 },
};

export function getActiveAssumptions(data) {
  const scenario = data.activeScenario || "base";
  if (data.useCustomAssumptions && data.customAssumptions?.[scenario]) {
    return data.customAssumptions[scenario];
  }
  return DEFAULT_SCENARIOS[scenario];
}

// ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

function p(val) {
  return parseFloat(String(val ?? "").replace(/,/g, "")) || 0;
}

function fvLump(pv, r, n) {
  return pv * Math.pow(1 + r, n);
}

function fvAnnuity(pmt, r, n) {
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

function estimateMarginalRate(taxableIncome) {
  if (taxableIncome > 190000) return 0.45;
  if (taxableIncome > 135000) return 0.37;
  if (taxableIncome >  45000) return 0.30;
  if (taxableIncome >  18200) return 0.15;
  return 0;
}

function monthlyPayment(balance, monthlyRate, remainingMonths) {
  if (monthlyRate === 0) return balance / remainingMonths;
  return balance * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths) /
    (Math.pow(1 + monthlyRate, remainingMonths) - 1);
}

// ── INCOME TAX ────────────────────────────────────────────────────────────────

/**
 * Comprehensive Australian income tax for one person — FY2026-27.
 *
 * @param {number} taxableIncome  Assessable income after salary sacrifice (salary + rental income/loss, etc.)
 * @param {object} opts
 *   superConcessional {number}  Total concessional contributions this year (SG + SS) — used for Div 293 test
 *   hasPrivateHealth  {boolean} Hospital-level private health insurance — exempts from MLS
 *   hecsDebt          {number}  Outstanding HELP/HECS balance (>0 triggers compulsory repayment)
 * @returns Detailed tax breakdown object
 */
export function calculatePersonTax(taxableIncome, {
  superConcessional    = 0,
  hasPrivateHealth     = true,
  hecsDebt             = 0,
  excessConcessional   = 0,   // amount above $30k cap — already in taxableIncome; credit 15% offset here
  frankingCredits      = 0,   // dividend imputation credits — direct offset against income tax; excess is refundable
} = {}) {
  const g = Math.max(0, taxableIncome);
  const zero = { taxableIncome: 0, incomeTax: 0, medicareLevy: 0, mls: 0, hecsRepayment: 0, division293: 0, totalTax: 0, afterTax: 0, effectiveRate: 0 };
  if (!g && !superConcessional) return zero;

  // 1. Bracket income tax
  let incomeTax = 0;
  for (const b of INCOME_TAX_BRACKETS) {
    if (g > b.from) {
      incomeTax += (Math.min(g, b.to) - b.from) * b.rate;
    }
  }

  // 1b. Excess concessional contributions included in assessable income — apply 15% offset credit
  // (fund already paid 15% contributions tax; ATO credits this against the marginal tax on excess)
  const excessConcessionalCredit = excessConcessional > 0 ? excessConcessional * 0.15 : 0;

  // 2. Low Income Tax Offset
  let lito = 0;
  if (g <= LITO.phase1UpTo) {
    lito = LITO.maxOffset;
  } else if (g <= 45000) {
    lito = Math.max(0, LITO.maxOffset - (g - LITO.phase1UpTo) * LITO.phase1Rate);
  } else if (g <= LITO.phase2UpTo) {
    lito = Math.max(0, 325 - (g - LITO.phase2From) * LITO.phase2Rate);
  }
  incomeTax = Math.max(0, incomeTax - lito - excessConcessionalCredit);

  // 1d. Franking credits (imputation) — offset income tax; excess is refundable by ATO
  const fcApplied = Math.min(incomeTax, frankingCredits);
  const frankingCreditRefund = Math.max(0, frankingCredits - fcApplied);
  incomeTax = incomeTax - fcApplied;

  // 3. Medicare Levy (simplified: 2% above shade-in threshold)
  const medicareLevy = g > MEDICARE.shadeInThreshold ? g * MEDICARE.levyRate : 0;

  // 4. Medicare Levy Surcharge (no private hospital cover)
  let mls = 0;
  if (!hasPrivateHealth) {
    for (let i = MLS_BRACKETS.length - 1; i >= 0; i--) {
      if (g > MLS_BRACKETS[i].above) { mls = g * MLS_BRACKETS[i].rate; break; }
    }
  }

  // 5. HELP/HECS compulsory repayment (cash outflow, not income tax, but tracked here)
  let hecsRepayment = 0;
  if (hecsDebt > 0 && g > 0) {
    for (let i = HELP_THRESHOLDS.length - 1; i >= 0; i--) {
      if (g >= HELP_THRESHOLDS[i].from) {
        hecsRepayment = Math.min(g * HELP_THRESHOLDS[i].rate, hecsDebt);
        break;
      }
    }
  }

  // 6. Division 293 — additional 15% on concessional contributions for high earners
  // Bill sent to individual (not deducted from fund); modelled as a cash outflow.
  let division293 = 0;
  if (superConcessional > 0) {
    const d293Base = g + superConcessional;
    if (d293Base > DIV_293.threshold) {
      const excess  = d293Base - DIV_293.threshold;
      const subject = Math.min(superConcessional, excess);
      division293   = subject * DIV_293.rate;
    }
  }

  const totalTax    = Math.round(incomeTax + medicareLevy + mls + hecsRepayment + division293);
  const afterTax    = Math.round(Math.max(0, g - totalTax));
  const effectiveRate = g > 0 ? totalTax / g : 0;

  return {
    taxableIncome:        Math.round(g),
    incomeTax:            Math.round(incomeTax),
    medicareLevy:         Math.round(medicareLevy),
    mls:                  Math.round(mls),
    hecsRepayment:        Math.round(hecsRepayment),
    division293:          Math.round(division293),
    excessConcessional:   Math.round(excessConcessional),
    frankingCredits:      Math.round(frankingCredits),
    frankingCreditRefund: Math.round(frankingCreditRefund),
    totalTax,
    afterTax,
    effectiveRate:        Math.round(effectiveRate * 10000) / 10000,
  };
}

/**
 * Household tax model — per-person tax with rental income/loss allocated by ownership %.
 * Returns individual tax details and household aggregate.
 */
export function calculateHouseholdTax(data, ipCashflows) {
  const isCouple = data.hasPartner === "yes";

  // Allocate rental income/loss per person by IP ownership %
  let rentalPerson1 = 0;
  let rentalPerson2 = 0;
  for (const cf of (ipCashflows || [])) {
    const ip = (data.investmentProperties || []).find(x => x.id === cf.id);
    const ownerPct = isCouple
      ? Math.min(100, Math.max(0, p(ip?.ownershipPct ?? "50"))) / 100
      : 1;
    rentalPerson1 += cf.taxableIncome * ownerPct;
    rentalPerson2 += isCouple ? cf.taxableIncome * (1 - ownerPct) : 0;
  }

  const ss1    = p(data.salarySacrifice);
  const ss2    = isCouple ? p(data.partnerSalarySacrifice) : 0;
  const gross1 = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const gross2 = isCouple ? p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome) : 0;

  // Carry-forward concessional cap (ATO: available when prior-year super balance < $500k)
  const CARRY_BALANCE_LIMIT = 500_000;
  const cfCap1 = p(data.carryForwardCap || "0");
  const cfCap2 = isCouple ? p(data.partnerCarryForwardCap || "0") : 0;
  const effectiveConcCap1 = p(data.superBalance) < CARRY_BALANCE_LIMIT
    ? SUPER.concessionalCap + cfCap1 : SUPER.concessionalCap;
  const effectiveConcCap2 = isCouple && p(data.partnerSuperBalance) < CARRY_BALANCE_LIMIT
    ? SUPER.concessionalCap + cfCap2 : SUPER.concessionalCap;

  // Franking credits (dividend imputation) per person
  const fc1 = p(data.frankingCredits || "0");
  const fc2 = isCouple ? p(data.partnerFrankingCredits || "0") : 0;

  // Concessional contributions (used for Div 293 test and excess cap detection)
  const sgRate1  = (p(data.employerSgRate) || SUPER.sgRate * 100) / 100;
  const sgRate2  = isCouple ? (p(data.partnerEmployerSgRate) || SUPER.sgRate * 100) / 100 : 0;
  const concess1 = gross1 * sgRate1 + ss1;
  const concess2 = isCouple ? gross2 * sgRate2 + ss2 : 0;

  // Excess concessional: amount above effective cap (incl. carry-forward) added back to assessable income
  const excessConc1 = Math.max(0, concess1 - effectiveConcCap1);
  const excessConc2 = isCouple ? Math.max(0, concess2 - effectiveConcCap2) : 0;

  // Taxable income = gross salary - salary sacrifice + rental income/loss + excess concessional (added back)
  const taxable1 = Math.max(-999999, gross1 - ss1 + rentalPerson1 + excessConc1);
  const taxable2 = isCouple ? Math.max(-999999, gross2 - ss2 + rentalPerson2 + excessConc2) : 0;

  const health1 = data.privateHealthInsurance !== "no";
  const health2 = isCouple ? data.partnerPrivateHealthInsurance !== "no" : true;
  const hecs1   = p(data.hecsDebt);
  const hecs2   = isCouple ? p(data.partnerHecsDebt) : 0;

  const p1Tax = calculatePersonTax(taxable1, { superConcessional: concess1, hasPrivateHealth: health1, hecsDebt: hecs1, excessConcessional: excessConc1, frankingCredits: fc1 });
  const p2Tax = isCouple ? calculatePersonTax(taxable2, { superConcessional: concess2, hasPrivateHealth: health2, hecsDebt: hecs2, excessConcessional: excessConc2, frankingCredits: fc2 }) : null;

  // Negative gearing tax benefit: how much less tax because of rental losses
  const negGearBenefit1 = rentalPerson1 < 0
    ? calculatePersonTax(taxable1 - rentalPerson1, { superConcessional: concess1, hasPrivateHealth: health1, hecsDebt: 0 }).incomeTax - p1Tax.incomeTax
    : 0;
  const negGearBenefit2 = (isCouple && rentalPerson2 < 0)
    ? calculatePersonTax(taxable2 - rentalPerson2, { superConcessional: concess2, hasPrivateHealth: health2, hecsDebt: 0 }).incomeTax - p2Tax.incomeTax
    : 0;

  return {
    person1: {
      grossIncome:    Math.round(gross1),
      taxableIncome:  Math.round(taxable1),
      rentalShare:    Math.round(rentalPerson1),
      ...p1Tax,
    },
    person2: p2Tax ? {
      grossIncome:    Math.round(gross2),
      taxableIncome:  Math.round(taxable2),
      rentalShare:    Math.round(rentalPerson2),
      ...p2Tax,
    } : null,
    totalHouseholdTax:    p1Tax.totalTax + (p2Tax?.totalTax || 0),
    totalAfterTax:        p1Tax.afterTax + (p2Tax?.afterTax || 0),
    negativeGearingBenefit: Math.round(Math.max(0, negGearBenefit1 + negGearBenefit2)),
    rentalIncomeLoss:     Math.round(rentalPerson1 + rentalPerson2),
    frankingCreditRefund: (p1Tax.frankingCreditRefund || 0) + (p2Tax?.frankingCreditRefund || 0),
  };
}

// ── PROPERTY CASHFLOW ─────────────────────────────────────────────────────────

/**
 * Annual cashflow for one investment property.
 * offsetBalance reduces the effective loan balance for interest calculation
 * (and therefore reduces deductible interest — important for ATO compliance).
 */
export function propertyAnnualCashflow(ip) {
  const vacancyRate  = (p(ip.vacancyRate)  || 4) / 100;
  const mgmtFeeRate  = (p(ip.managementFee) || 8) / 100;

  const grossRent     = p(ip.weeklyRent) * 52 * (1 - vacancyRate);
  const mgmtFee       = grossRent * mgmtFeeRate;
  const councilRates  = p(ip.councilRates);
  const insurance     = p(ip.insurance);
  const bodyCorpAdmin = p(ip.bodyCorpAdmin);
  const bodyCorpCap   = p(ip.bodyCorpCapital);
  const maintenance   = p(ip.maintenance);
  const depreciation  = p(ip.depreciation);

  // Offset account reduces deductible interest (ATO: s8-1 ITAA 1997)
  const offsetBal      = p(ip.offsetBalance || "0");
  const effectiveDebt  = Math.max(0, p(ip.mortgageBalance) - offsetBal);
  const annualInterest = effectiveDebt * (p(ip.mortgageRate) / 100);

  const totalExpenses  = mgmtFee + councilRates + insurance + bodyCorpAdmin +
                         bodyCorpCap + maintenance + annualInterest;
  const netCashflow    = grossRent - totalExpenses;
  // Taxable income adds depreciation as a further deduction (non-cash)
  const taxableIncome  = netCashflow - depreciation;

  return {
    grossRent:          Math.round(grossRent),
    mgmtFee:            Math.round(mgmtFee),
    councilRates:       Math.round(councilRates),
    insurance:          Math.round(insurance),
    bodyCorpAdmin:      Math.round(bodyCorpAdmin),
    bodyCorpCap:        Math.round(bodyCorpCap),
    maintenance:        Math.round(maintenance),
    annualInterest:     Math.round(annualInterest),
    depreciation:       Math.round(depreciation),
    totalExpenses:      Math.round(totalExpenses),
    netCashflow:        Math.round(netCashflow),
    taxableIncome:      Math.round(taxableIncome),
    isNegativelyGeared: taxableIncome < 0,
    offsetBalance:      Math.round(offsetBal),
  };
}

// ── SUPER ACCUMULATION ────────────────────────────────────────────────────────

/**
 * Project super balance for one person to their retirement age.
 * Deducts 15% contributions tax from all concessional contributions.
 * Also models Division 293 if applicable (as a separate cash flow, not super reduction).
 */
function projectOnePerson(balance, grossIncome, sgRate, salarySacrifice, currentAge, retirementAge, returnRate, annualSuperInsurance = 0) {
  const years          = Math.max(retirementAge - currentAge, 0);
  const r              = returnRate;
  const sgAmount       = grossIncome * sgRate;
  const ssAmount       = salarySacrifice;
  const concessional   = Math.min(sgAmount + ssAmount, SUPER.concessionalCap);
  // 15% contributions tax reduces net amount entering fund
  const netContribs    = concessional * (1 - SUPER.contribTaxRate);
  // Insurance premiums are deducted from the account balance each year (not from contributions)
  const netAnnual      = netContribs - annualSuperInsurance;

  const projectedBalance = fvLump(balance, r, years) + fvAnnuity(netAnnual, r, years);

  const trajectory = [];
  let bal = balance;
  for (let y = 0; y <= years; y++) {
    trajectory.push({ age: currentAge + y, balance: Math.round(bal) });
    bal = bal * (1 + r) + netAnnual;
  }

  return {
    projectedBalance: Math.round(projectedBalance),
    yearsToRetirement: years,
    annualConcessional: Math.round(concessional),
    annualNetContribs:  Math.round(netContribs),
    trajectory,
  };
}

export function projectSuper(data, assumptions) {
  const r             = assumptions.returnRate / 100;
  const currentAge    = p(data.age);
  const retirementAge = p(data.retirementAge) || 65;
  const isCouple      = data.hasPartner === "yes";

  const sgRate1   = (p(data.employerSgRate) || 12) / 100;
  const sgRate2   = isCouple ? (p(data.partnerEmployerSgRate) || 12) / 100 : 0;
  const gross1    = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const gross2    = isCouple ? p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome) : 0;
  const ss1       = p(data.salarySacrifice);
  const ss2       = isCouple ? p(data.partnerSalarySacrifice) : 0;
  const partnerRetirementAge = isCouple ? (p(data.partnerRetirementAge) || retirementAge) : retirementAge;
  const partnerAge = isCouple ? p(data.partnerAge) : 0;

  const ins1 = p(data.insurancePremium) > 0 && data.insuranceInSuper === "yes" ? p(data.insurancePremium) : 0;
  const ins2 = isCouple && p(data.partnerInsurancePremium) > 0 && data.partnerInsuranceInSuper === "yes" ? p(data.partnerInsurancePremium) : 0;

  const person1 = projectOnePerson(p(data.superBalance), gross1, sgRate1, ss1, currentAge, retirementAge, r, ins1);
  const person2 = isCouple
    ? projectOnePerson(p(data.partnerSuperBalance), gross2, sgRate2, ss2, partnerAge, partnerRetirementAge, r, ins2)
    : null;

  // Combined balance at retirement (use primary person's retirement age for joint view)
  const person2AtSameAge = person2
    ? (person2.trajectory.find(t => t.age === partnerAge + (retirementAge - currentAge)) || person2.trajectory[person2.trajectory.length - 1])
    : null;
  const combinedAtRetirement = Math.round(person1.projectedBalance + (person2AtSameAge?.balance || 0));

  return {
    person1,
    person2,
    projectedBalance:  combinedAtRetirement,
    yearsToRetirement: person1.yearsToRetirement,
    annualContribs:    Math.round(person1.annualNetContribs + (person2?.annualNetContribs || 0)),
    trajectory: person1.trajectory,
  };
}

// ── ACCOUNT-BASED PENSION ─────────────────────────────────────────────────────

/** Minimum annual drawdown from an account-based pension at a given age. */
export function abpMinDrawdown(balance, age) {
  const rule = ABP_DRAWDOWN.find(r => age >= r.minAge && age <= r.maxAge);
  return rule ? Math.round(balance * rule.rate) : 0;
}

// ── AGE PENSION ESTIMATE ──────────────────────────────────────────────────────

/**
 * Estimate annual Age Pension entitlement.
 * Uses the lower of the assets test result and the income test result.
 *
 * IMPORTANT: This is a simplified estimate for planning purposes only.
 * Actual entitlement requires assessment by Services Australia.
 * Does not model: deeming rates on financial assets, grandfathered rules,
 * work bonus, rent assistance, or non-assessable assets (PPOR is excluded).
 *
 * @param {boolean} isCouple
 * @param {boolean} isHomeowner  PPOR is not counted in assets test
 * @param {number}  assessableAssets  Total net assets excluding PPOR
 * @param {number}  assessableIncome  Annual income (excluding AP itself; financial assets deemed)
 * @param {number}  age  Current age (must be ≥ eligibilityAge to receive)
 */
export function estimateAgePension(isCouple, isHomeowner, assessableAssets, assessableIncome, age) {
  if (age < AGE_PENSION.eligibilityAge) {
    return { eligible: false, estimatedAnnual: 0, reason: "Below eligibility age" };
  }

  const fullRate = isCouple ? AGE_PENSION.coupleRate : AGE_PENSION.singleRate;

  // Assets test
  const freeArea = isCouple
    ? (isHomeowner ? AGE_PENSION.assetsFree.coupleHome    : AGE_PENSION.assetsFree.coupleNonHome)
    : (isHomeowner ? AGE_PENSION.assetsFree.singleHome    : AGE_PENSION.assetsFree.singleNonHome);
  const assetsExcess    = Math.max(0, assessableAssets - freeArea);
  const assetsReduction = (assetsExcess / 1000) * AGE_PENSION.assetsTaperPerThousand;
  const pensionByAssets = Math.max(0, fullRate - assetsReduction);

  // Income test
  const incomeFreeLine = isCouple ? AGE_PENSION.incomeFree.couple : AGE_PENSION.incomeFree.single;
  const incomeExcess    = Math.max(0, assessableIncome - incomeFreeLine);
  const incomeReduction = incomeExcess * AGE_PENSION.incomeTaperRate;
  const pensionByIncome = Math.max(0, fullRate - incomeReduction);

  // Lower of the two tests (assets and income) determines entitlement
  const estimatedAnnual = Math.round(Math.min(pensionByAssets, pensionByIncome));
  const eligible        = estimatedAnnual > 0;

  return {
    eligible,
    estimatedAnnual,
    fullRate,
    pensionByAssets:   Math.round(pensionByAssets),
    pensionByIncome:   Math.round(pensionByIncome),
    limitingTest:      pensionByAssets < pensionByIncome ? "assets" : "income",
    assetsExcess:      Math.round(assetsExcess),
    incomeExcess:      Math.round(incomeExcess),
    reason: eligible
      ? (estimatedAnnual >= fullRate * 0.99 ? "Full pension" : "Part pension")
      : "Exceeds both assets and income test limits",
  };
}

// ── DEBT-FREE DATE ────────────────────────────────────────────────────────────

export function debtFreeDate(data) {
  const balance    = p(data.mortgageBalance);
  const annualRate = p(data.mortgageRate);
  const loanType   = data.loanType || "pi";
  const currentYear = new Date().getFullYear();

  const startYear    = p(data.mortgageStartYear) || currentYear;
  const tenure       = p(data.mortgageTenure) || 30;
  const elapsed      = Math.max(0, currentYear - startYear);
  const remainingYrs = Math.max(1, tenure - elapsed);
  const LOAN_MONTHS  = remainingYrs * 12;
  const loanEndYear  = startYear + tenure;
  const monthlyRate  = annualRate / 100 / 12;

  // PPOR offset reduces effective balance for payment calculation
  const offsetBal       = p(data.ppOrOffsetBalance || "0");
  const effectiveBalance = Math.max(0, balance - offsetBal);

  let pporResult = null;
  if (balance) {
    if (loanType === "io") {
      const ioExpiryYear = p(data.mortgageIoExpiryYear);
      const ioActive     = ioExpiryYear > 0 && ioExpiryYear < loanEndYear;
      const ioMonthlyPmt = monthlyRate > 0 ? Math.round(effectiveBalance * monthlyRate) : 0;
      if (ioActive) {
        const piYears  = Math.max(1, loanEndYear - ioExpiryYear);
        const piMonths = piYears * 12;
        const piPmt    = monthlyRate > 0
          ? monthlyPayment(effectiveBalance, monthlyRate, piMonths)
          : effectiveBalance / piMonths;
        pporResult = {
          type: "io", ioExpiryYear, loanEndYear, debtFreeYear: loanEndYear,
          monthlyPayment: ioMonthlyPmt, piMonthlyPayment: Math.round(piPmt),
        };
      } else {
        pporResult = { type: "io", ioExpiryYear: null, loanEndYear: null, debtFreeYear: null, monthlyPayment: ioMonthlyPmt };
      }
    } else {
      const pmt = monthlyRate > 0
        ? monthlyPayment(effectiveBalance, monthlyRate, LOAN_MONTHS)
        : effectiveBalance / LOAN_MONTHS;
      let bal = effectiveBalance, months = 0;
      while (bal > 0.01 && months < LOAN_MONTHS + 1) {
        bal -= pmt - bal * monthlyRate;
        months++;
      }
      pporResult = {
        type: "pi",
        monthsToPayoff: months,
        yearsToPayoff:  Math.ceil(months / 12),
        debtFreeYear:   currentYear + Math.ceil(months / 12),
        monthlyPayment: Math.round(pmt),
      };
    }
  }

  // Investment properties
  const ipResults = (data.investmentProperties || [])
    .filter(ip => ip.status === "existing" && p(ip.mortgageBalance) > 0)
    .map(ip => {
      const ipBal         = p(ip.mortgageBalance);
      const ipOffset      = p(ip.offsetBalance || "0");
      const ipEffective   = Math.max(0, ipBal - ipOffset);
      const ipMonthlyRate = p(ip.mortgageRate) / 100 / 12;
      if (ip.loanType === "io") {
        const ipIoExpiry  = p(ip.ioExpiryYear);
        const ipStartYr   = p(ip.purchaseYear) || currentYear;
        const ipEndYear   = ipStartYr + 30;
        const ipIoMonthly = ipMonthlyRate > 0 ? Math.round(ipEffective * ipMonthlyRate) : 0;
        const ipIoActive  = ipIoExpiry > 0 && ipIoExpiry < ipEndYear;
        if (ipIoActive) {
          const piYrs  = Math.max(1, ipEndYear - ipIoExpiry);
          const piMths = piYrs * 12;
          const piPmt  = ipMonthlyRate > 0 ? monthlyPayment(ipEffective, ipMonthlyRate, piMths) : ipEffective / piMths;
          return {
            id: ip.id, label: ip.label || "IP", type: "io",
            ioExpiryYear: ipIoExpiry, loanEndYear: ipEndYear, debtFreeYear: ipEndYear,
            monthlyPayment: ipIoMonthly, piMonthlyPayment: Math.round(piPmt),
          };
        }
        return { id: ip.id, label: ip.label || "IP", type: "io", debtFreeYear: null, monthlyPayment: ipIoMonthly };
      }
      const pmt = ipMonthlyRate > 0
        ? monthlyPayment(ipEffective, ipMonthlyRate, LOAN_MONTHS)
        : ipEffective / LOAN_MONTHS;
      let bal = ipEffective, months = 0;
      while (bal > 0.01 && months < LOAN_MONTHS + 1) {
        bal -= pmt - bal * ipMonthlyRate;
        months++;
      }
      return {
        id: ip.id, label: ip.label || "IP", type: "pi",
        yearsToPayoff:  Math.ceil(months / 12),
        debtFreeYear:   currentYear + Math.ceil(months / 12),
        monthlyPayment: Math.round(pmt),
      };
    });

  if (!pporResult && ipResults.length === 0) return null;
  return { ...(pporResult || { type: null }), ips: ipResults };
}

// ── RETIREMENT DRAWDOWN ───────────────────────────────────────────────────────

export function retirementDrawdown(data, assumptions, projectedSuperBalance) {
  const currentAge        = p(data.age);
  const retirementAge     = p(data.retirementAge) || 65;
  const lifeExp           = p(data.lifeExpectancy) || 90;
  const yearsInRetirement = Math.max(lifeExp - retirementAge, 0);
  const yearsToRetirement = Math.max(retirementAge - currentAge, 0);

  const targetSpendingToday = p(data.targetRetirementSpending);
  const r   = assumptions.returnRate / 100;
  const inf = assumptions.inflation / 100;
  const swr = assumptions.safeWithdrawal / 100;

  const futureSpending  = targetSpendingToday * Math.pow(1 + inf, yearsToRetirement);
  const requiredBalance = swr > 0 ? Math.round(futureSpending / swr) : 0;

  // Transfer Balance Cap: super above TBC stays in accumulation phase (taxed on earnings)
  // Simplified: cap total pension balance at TBC; model excess as general investment
  const pensionBalance  = Math.min(projectedSuperBalance, SUPER.transferBalanceCap);
  const excessAccum     = Math.max(0, projectedSuperBalance - SUPER.transferBalanceCap);

  let balance = pensionBalance;
  let excessBal = excessAccum;
  let depletionAge = null;
  const trajectory = [];

  for (let y = 0; y < yearsInRetirement; y++) {
    const age        = retirementAge + y;
    const withdrawal = futureSpending * Math.pow(1 + inf, y);

    // Minimum drawdown check — must draw at least the legislated minimum from pension account
    const minDraw    = abpMinDrawdown(balance, age);
    const actualDraw = Math.max(withdrawal, minDraw);

    balance = balance * (1 + r) - actualDraw;

    // If pension depleted, drawdown from excess accumulation balance
    if (balance < 0 && excessBal > 0) {
      excessBal = Math.max(0, excessBal + balance); // balance is negative here
      balance   = 0;
    }

    const totalBal = balance + excessBal;

    if (totalBal <= 0 && depletionAge === null) {
      depletionAge = age;
      trajectory.push({ age, balance: 0 });
      break;
    }
    trajectory.push({ age, balance: Math.round(totalBal) });

    // Excess accumulation grows at same return rate
    if (excessBal > 0) excessBal = excessBal * (1 + r);
  }

  return {
    projectedSuperBalance: Math.round(projectedSuperBalance),
    pensionBalance:        Math.round(pensionBalance),
    excessAccumulation:    Math.round(excessAccum),
    requiredBalance,
    surplus:               Math.round(projectedSuperBalance - requiredBalance),
    onTrack:               projectedSuperBalance >= requiredBalance,
    depletionAge,
    lastsToLifeExpectancy: depletionAge === null,
    futureSpending:        Math.round(futureSpending),
    transferBalanceCap:    SUPER.transferBalanceCap,
    capExceeded:           projectedSuperBalance > SUPER.transferBalanceCap,
    trajectory,
  };
}

// ── FIRE CALCULATOR ───────────────────────────────────────────────────────────

/**
 * FIRE-specific calculations: FIRE number, Coast FIRE, bridge fund, years to FI.
 * All figures in nominal dollars (not inflation-adjusted) for consistency with trajectory.
 */
export function fireCalc(data, assumptions) {
  const r             = assumptions.returnRate / 100;
  const currentAge    = p(data.age);
  const retirementAge = p(data.retirementAge) || 65;
  const targetSpend   = p(data.targetRetirementSpending);
  const swr           = assumptions.safeWithdrawal / 100;

  if (!targetSpend || !currentAge) return null;

  const fireNumber     = swr > 0 ? Math.round(targetSpend / swr) : 0;
  const yearsToRetire  = Math.max(0, retirementAge - currentAge);

  // Coast FIRE: balance needed today that grows to fireNumber by retirement with no further contributions
  const coastFireNumber = yearsToRetire > 0
    ? Math.round(fireNumber / Math.pow(1 + r, yearsToRetire))
    : fireNumber;

  const isCouple = data.hasPartner === "yes";

  // Current investable assets (super only — most reliable pre-retirement asset)
  const currentSuper = p(data.superBalance) + (isCouple ? p(data.partnerSuperBalance) : 0);

  const isCoastFIRE  = currentSuper >= coastFireNumber;

  // Annual investment into super (post contributions tax)
  const gross1    = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const gross2    = isCouple ? p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome) : 0;
  const sgRate1   = (p(data.employerSgRate) || 12) / 100;
  const sgRate2   = isCouple ? (p(data.partnerEmployerSgRate) || 12) / 100 : 0;
  const ss1       = p(data.salarySacrifice);
  const ss2       = isCouple ? p(data.partnerSalarySacrifice) : 0;
  const concess1  = Math.min(gross1 * sgRate1 + ss1, SUPER.concessionalCap);
  const concess2  = isCouple ? Math.min(gross2 * sgRate2 + ss2, SUPER.concessionalCap) : 0;
  const netContribs = (concess1 + concess2) * (1 - SUPER.contribTaxRate);
  const annualSavings = p(data.savingsPerMonth) * 12;
  const totalAnnualInvest = netContribs + annualSavings;

  // Years to FI: numerically solve for the year when total invested assets reach fireNumber
  let yearsToFI = null;
  if (totalAnnualInvest > 0 && r > 0) {
    let bal = currentSuper;
    let y = 0;
    while (bal < fireNumber && y < 100) {
      bal = bal * (1 + r) + totalAnnualInvest;
      y++;
    }
    yearsToFI = bal >= fireNumber ? y : null;
  } else if (currentSuper >= fireNumber) {
    yearsToFI = 0;
  }

  const projectedFIAge = yearsToFI !== null ? currentAge + yearsToFI : null;

  // Bridge fund: liquid capital needed outside super to cover spending from ER to preservation age 60
  const bridgeYears      = retirementAge < SUPER.preservationAge ? SUPER.preservationAge - retirementAge : 0;
  // Simplified: present value of spending stream at real return rate
  const realRate         = Math.max(0, r - assumptions.inflation / 100);
  const bridgeFundNeeded = bridgeYears > 0 && targetSpend > 0
    ? (realRate > 0
        ? Math.round(targetSpend * (1 - Math.pow(1 + realRate, -bridgeYears)) / realRate)
        : Math.round(targetSpend * bridgeYears))
    : 0;

  return {
    fireNumber,
    coastFireNumber,
    isCoastFIRE,
    yearsToFI,
    projectedFIAge,
    bridgeYears,
    bridgeFundNeeded,
    currentInvestableAssets: Math.round(currentSuper),
    annualInvestment: Math.round(totalAnnualInvest),
  };
}

// ── NET WORTH TRAJECTORY ──────────────────────────────────────────────────────

export function netWorthTrajectory(data, assumptions, householdTax) {
  const currentAge    = p(data.age);
  const retirementAge = p(data.retirementAge) || 65;
  const lifeExp       = p(data.lifeExpectancy) || 90;
  const yearsTotal    = Math.max(lifeExp - currentAge, 0);
  const isCouple      = data.hasPartner === "yes";

  const r          = assumptions.returnRate / 100;
  const propGrowth = assumptions.propertyGrowth / 100;
  const inf        = assumptions.inflation / 100;
  const currentYear = new Date().getFullYear();

  // Pre-index life events by calendar year
  const eventMap = indexEventsByYear(data.lifeEvents || []);

  // Income ratio for partner-specific events (primary person's share of gross income)
  const gross1 = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const gross2 = isCouple ? p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome) : 0;
  const incRatio = (gross1 + gross2) > 0 ? gross1 / (gross1 + gross2) : 0.5;

  // Callers spread deriveAssetTotals() flat onto data — read fields directly
  let liquid   = p(data.cashSavings) + p(data.sharesEtfs) + p(data.managedFunds) +
                 p(data.crypto) + p(data.otherInvestments);
  let superBal = p(data.superBalance) + (isCouple ? p(data.partnerSuperBalance) : 0);
  let ppor     = p(data.ppOrValue);
  let mortgage  = Math.max(0, p(data.mortgageBalance) - p(data.ppOrOffsetBalance || "0"));
  let otherDebt = p(data.creditCardDebt) + p(data.personalLoanDebt) + p(data.hecsDebt)
                + (isCouple ? p(data.partnerCreditCardDebt) + p(data.partnerPersonalLoanDebt) + p(data.partnerHecsDebt) : 0);

  const existingIPs   = (data.investmentProperties || []).filter(ip => ip.status === "existing");
  let ipTotal         = existingIPs.reduce((sum, ip) => sum + p(ip.value), 0);
  let ipMortTotal     = existingIPs.reduce((sum, ip) => sum + p(ip.mortgageBalance), 0);

  const ipWeightedRate = ipMortTotal > 0
    ? existingIPs.filter(ip => p(ip.mortgageBalance) > 0)
        .reduce((sum, ip) => sum + p(ip.mortgageRate) * p(ip.mortgageBalance), 0) / ipMortTotal
    : 0;
  const ipMonthlyRate = ipWeightedRate / 100 / 12;
  const ipPmt = (ipMortTotal > 0 && ipMonthlyRate > 0)
    ? monthlyPayment(ipMortTotal, ipMonthlyRate, 360) : 0;

  // Net cashflow from IPs: rental minus running costs, PLUS negative gearing tax benefit
  const ipNetAnnualCF = existingIPs.reduce((sum, ip) => sum + propertyAnnualCashflow(ip).netCashflow, 0);
  const negGearBenefit = householdTax?.negativeGearingBenefit || 0;

  // Franking credit refund flows to liquid each year (ATO refund of excess imputation credits)
  const frankingRefund = householdTax?.frankingCreditRefund || 0;

  // Debt recycling: annual tax saving from deductible investment debt
  const debtRecycling = data.debtRecycling === true || data.debtRecycling === "true";
  const mortgageRateAnnual = p(data.mortgageRate) / 100;
  const marginalRate1 = estimateMarginalRate(gross1 - p(data.salarySacrifice));
  let recycledCumulative = 0;

  // Insurance: inside super reduces super balance; outside super reduces liquid savings
  const superInsurance = (p(data.insurancePremium) > 0 && data.insuranceInSuper === "yes" ? p(data.insurancePremium) : 0)
    + (isCouple && p(data.partnerInsurancePremium) > 0 && data.partnerInsuranceInSuper === "yes" ? p(data.partnerInsurancePremium) : 0);
  const liquidInsurance = (p(data.insurancePremium) > 0 && data.insuranceInSuper !== "yes" ? p(data.insurancePremium) : 0)
    + (isCouple && p(data.partnerInsurancePremium) > 0 && data.partnerInsuranceInSuper !== "yes" ? p(data.partnerInsurancePremium) : 0);

  const annualSavings = p(data.savingsPerMonth) * 12;
  const sgRate1       = (p(data.employerSgRate) || 12) / 100;
  const sgRate2       = isCouple ? (p(data.partnerEmployerSgRate) || 12) / 100 : 0;
  const ss1           = p(data.salarySacrifice);
  const ss2           = isCouple ? p(data.partnerSalarySacrifice) : 0;
  // Net super contributions after 15% contributions tax
  const sg1           = gross1 * sgRate1;
  const sg2           = isCouple ? gross2 * sgRate2 : 0;
  const concess1      = Math.min(sg1 + ss1, SUPER.concessionalCap);
  const concess2      = isCouple ? Math.min(sg2 + ss2, SUPER.concessionalCap) : 0;
  const annualSuperIn = (concess1 + concess2) * (1 - SUPER.contribTaxRate);

  const targetSpending = p(data.targetRetirementSpending);

  const mortgageMonthlyRate = p(data.mortgageRate) / 100 / 12;
  const mortgagePmt = (mortgage > 0 && mortgageMonthlyRate > 0 && data.loanType === "pi")
    ? monthlyPayment(mortgage, mortgageMonthlyRate, 360) : 0;
  const annualMortgagePmt = mortgagePmt * 12;

  const trajectory = [];

  for (let y = 0; y <= yearsTotal; y++) {
    const age       = currentAge + y;
    const calYear   = currentYear + y;
    const isRetired = age >= retirementAge;
    const nw = liquid + superBal + ppor + ipTotal - mortgage - ipMortTotal - Math.max(otherDebt, 0);

    // Life events active in this calendar year
    const { eventTypes } = getYearEventAdjustments(calYear, eventMap, incRatio, marginalRate1);

    trajectory.push({
      age,
      year: calYear,
      netWorth:     Math.round(nw),
      superBalance: Math.round(superBal),
      liquidAssets: Math.round(liquid),
      propertyValue: Math.round(ppor + ipTotal),
      totalDebt:    Math.round(Math.max(0, mortgage + ipMortTotal + Math.max(0, otherDebt))),
      isRetired,
      eventTypes,   // string[] of event type keys active this year
    });

    if (y === yearsTotal) break;

    if (!isRetired) {
      // Apply life events for the UPCOMING year (y+1) — adjustments to cashflows
      const nextCalYear = currentYear + y + 1;
      const adj = getYearEventAdjustments(nextCalYear, eventMap, incRatio, marginalRate1);

      const effectiveSavings  = annualSavings * adj.incomeMult;
      const effectiveSuperIn  = annualSuperIn * adj.incomeMult;

      // Lump-sum adjustments
      liquid += adj.lumpIn - adj.lumpOut;
      // Extra mortgage repayments
      if (adj.extraMortgageRepay > 0) {
        mortgage = Math.max(0, mortgage - adj.extraMortgageRepay);
      }

      // Debt recycling: annual tax saving from deductible investment debt (pre-retirement only)
      let drTaxSaving = 0;
      if (debtRecycling && mortgage > 0) {
        recycledCumulative = Math.min(recycledCumulative + effectiveSavings * 0.5, mortgage);
        drTaxSaving = recycledCumulative * mortgageRateAnnual * marginalRate1;
      }

      // IP net cashflow + negative gearing benefit + franking refund + debt recycling saving
      // Outside-super insurance premiums reduce liquid savings; inside-super premiums reduce super balance
      liquid   = liquid * (1 + r) + effectiveSavings + ipNetAnnualCF + negGearBenefit + frankingRefund + drTaxSaving - liquidInsurance;
      superBal = superBal * (1 + r) + effectiveSuperIn - superInsurance;
    } else {
      const withdrawal = targetSpending * Math.pow(1 + inf, y - (retirementAge - currentAge));
      if (superBal >= withdrawal) {
        superBal = superBal * (1 + r) - withdrawal;
      } else {
        const remainder = withdrawal - superBal;
        superBal = 0;
        liquid   = Math.max(0, liquid * (1 + r) - remainder);
      }
      if (liquid > 0) liquid = liquid * (1 + r);
    }

    ppor    = ppor    > 0 ? ppor    * (1 + propGrowth) : 0;
    ipTotal = ipTotal > 0 ? ipTotal * (1 + propGrowth) : 0;

    if (mortgage > 0 && data.loanType === "pi") {
      const interest  = mortgage * (p(data.mortgageRate) / 100);
      const principal = Math.min(annualMortgagePmt - interest, mortgage);
      mortgage = Math.max(0, mortgage - principal);
    }

    if (ipMortTotal > 0) {
      const ipInterest  = ipMortTotal * (ipWeightedRate / 100);
      const ipPrincipal = Math.min(ipPmt * 12 - ipInterest, ipMortTotal);
      ipMortTotal = Math.max(0, ipMortTotal - ipPrincipal);
    }

    if (otherDebt > 0) otherDebt = Math.max(0, otherDebt - otherDebt / 3);
  }

  return trajectory;
}

// ── MONTE CARLO SIMULATION ────────────────────────────────────────────────────

const SCENARIO_VOLATILITY = { base: 0.10, conservative: 0.08, aggressive: 0.14 };

function normalRandom(mean, sd) {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function runMonteCarlo(data, assumptions, iterations = 1000) {
  const currentAge    = p(data.age);
  const retirementAge = p(data.retirementAge) || 65;
  const lifeExp       = p(data.lifeExpectancy) || 90;
  const yearsToRetire = Math.max(retirementAge - currentAge, 0);
  const yearsInRetire = Math.max(lifeExp - retirementAge, 0);

  const meanReturn = assumptions.returnRate / 100;
  const inf        = assumptions.inflation / 100;
  const scenario   = data.activeScenario || "base";
  const stdDev     = SCENARIO_VOLATILITY[scenario] ?? 0.10;

  const isCouple   = data.hasPartner === "yes";
  const superBal   = p(data.superBalance) + (isCouple ? p(data.partnerSuperBalance) : 0);
  const gross1     = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);
  const gross2     = isCouple ? p(data.partnerIncome) + p(data.partnerBonusIncome) + p(data.partnerOtherIncome) : 0;
  const sgRate1    = (p(data.employerSgRate) || 12) / 100;
  const sgRate2    = isCouple ? (p(data.partnerEmployerSgRate) || 12) / 100 : 0;
  const ss1        = p(data.salarySacrifice);
  const ss2        = isCouple ? p(data.partnerSalarySacrifice) : 0;
  const concess    = Math.min(gross1 * sgRate1 + ss1, SUPER.concessionalCap) +
                     (isCouple ? Math.min(gross2 * sgRate2 + ss2, SUPER.concessionalCap) : 0);
  const annualContribs = concess * (1 - SUPER.contribTaxRate);
  const targetSpending = p(data.targetRetirementSpending);

  if (!targetSpending || yearsToRetire <= 0) return null;

  const futureSpending = targetSpending * Math.pow(1 + inf, yearsToRetire);

  let successes = 0;
  const retirementBals = [];
  const finalBals      = [];

  for (let i = 0; i < iterations; i++) {
    let bal = superBal;
    for (let y = 0; y < yearsToRetire; y++) {
      const r = normalRandom(meanReturn, stdDev);
      bal = bal * (1 + Math.max(r, -0.5)) + annualContribs;
    }
    retirementBals.push(bal);

    let drawBal  = bal;
    let depleted = false;
    for (let y = 0; y < yearsInRetire; y++) {
      const age        = retirementAge + y;
      const r          = normalRandom(meanReturn, stdDev);
      const withdrawal = Math.max(futureSpending * Math.pow(1 + inf, y), abpMinDrawdown(drawBal, age));
      drawBal = drawBal * (1 + Math.max(r, -0.5)) - withdrawal;
      if (drawBal <= 0) { depleted = true; break; }
    }
    if (!depleted) successes++;
    finalBals.push(depleted ? 0 : drawBal);
  }

  retirementBals.sort((a, b) => a - b);
  finalBals.sort((a, b) => a - b);

  const pct = (arr, pc) => Math.round(arr[Math.floor(arr.length * pc / 100)] ?? 0);

  return {
    successRate: Math.round((successes / iterations) * 100),
    iterations,
    stdDev,
    retirementBalance: {
      p10: pct(retirementBals, 10), p25: pct(retirementBals, 25),
      p50: pct(retirementBals, 50), p75: pct(retirementBals, 75),
      p90: pct(retirementBals, 90),
    },
    finalBalance: {
      p10: pct(finalBals, 10), p25: pct(finalBals, 25), p50: pct(finalBals, 50),
    },
  };
}

// ── TRANSITION TO RETIREMENT (TTR) ────────────────────────────────────────────

function calculateTTR(data, assumptions) {
  const currentAge    = p(data.age);
  const retirementAge = p(data.retirementAge) || 65;
  const superBalance  = p(data.superBalance);
  const grossIncome   = p(data.grossIncome) + p(data.bonusIncome) + p(data.otherIncome);

  if (!currentAge || !grossIncome || superBalance <= 0) {
    return { eligible: false };
  }

  const preservationAge = SUPER.preservationAge; // 60

  // TTR is only available from preservation age up to (not including) full retirement
  if (currentAge < preservationAge || currentAge >= retirementAge) {
    return { eligible: false };
  }

  const sgRate            = (p(data.employerSgRate) || 12) / 100;
  const existingConcessional = Math.min(grossIncome * sgRate + p(data.salarySacrifice), SUPER.concessionalCap);
  const additionalSSRoom  = Math.max(0, SUPER.concessionalCap - existingConcessional);

  // No benefit if already maxing concessional cap
  if (additionalSSRoom < 1000) {
    return { eligible: false, capAlreadyMaxed: true, currentAge, retirementAge, preservationAge };
  }

  const marginalRate      = estimateMarginalRate(grossIncome);
  const arbitrageRate     = marginalRate - SUPER.contribTaxRate; // tax saving per $ of SS
  const yearsOfTTR        = retirementAge - currentAge;

  // TTR pension: draw 4-10% of super balance; target enough to replace SS income sacrifice
  // (salary sacrifice reduces take-home pay; TTR pension can offset this)
  const ttrPensionMin     = superBalance * 0.04;
  const ttrPensionMax     = superBalance * 0.10;
  // Optimal: draw enough TTR pension to maintain cashflow while maximising SS
  const effectiveAdditionalSS = Math.min(additionalSSRoom, grossIncome * 0.10); // cap at 10% of income
  const ttrPension        = Math.min(ttrPensionMax, Math.max(ttrPensionMin, effectiveAdditionalSS));

  const annualTaxBenefit  = effectiveAdditionalSS * arbitrageRate;
  const cumulativeTaxBenefit = annualTaxBenefit * yearsOfTTR;

  // Super balance with vs without TTR (simplified: net additional contributions compounded)
  const r = assumptions.returnRate / 100;
  const netAdditionalContrib = effectiveAdditionalSS * (1 - SUPER.contribTaxRate);
  const superWithoutTTR = fvLump(superBalance, r, yearsOfTTR) +
    fvAnnuity(existingConcessional * (1 - SUPER.contribTaxRate), r, yearsOfTTR);
  const superWithTTR = fvLump(superBalance, r, yearsOfTTR) +
    fvAnnuity((existingConcessional + effectiveAdditionalSS) * (1 - SUPER.contribTaxRate), r, yearsOfTTR);
  const superBenefit = superWithTTR - superWithoutTTR;

  return {
    eligible: true,
    capAlreadyMaxed: false,
    currentAge,
    retirementAge,
    preservationAge,
    yearsOfTTR,
    existingConcessional,
    additionalSSRoom,
    effectiveAdditionalSS,
    ttrPension,
    annualTaxBenefit,
    cumulativeTaxBenefit,
    superWithoutTTR,
    superWithTTR,
    superBenefit,
    marginalRate,
    arbitrageRate,
  };
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export function runEngine(data, { skipMonteCarlo = false } = {}) {
  const assumptions = getActiveAssumptions(data);

  const propertyCashflows = (data.investmentProperties || []).map(ip => ({
    id: ip.id, label: ip.label, status: ip.status,
    ...propertyAnnualCashflow(ip),
  }));

  const householdTax = calculateHouseholdTax(data, propertyCashflows.filter(cf => cf.status === "existing"));

  const superResult  = projectSuper(data, assumptions);
  const drawdown     = retirementDrawdown(data, assumptions, superResult.projectedBalance);
  const mortgage     = debtFreeDate(data);
  const trajectory   = netWorthTrajectory(data, assumptions, householdTax);
  const monteCarlo   = skipMonteCarlo ? null : runMonteCarlo(data, assumptions);

  const retirementAge    = p(data.retirementAge) || 65;
  const atRetirement     = trajectory.find(t => t.age === retirementAge);
  const atEnd            = trajectory[trajectory.length - 1];

  // Age Pension estimate at retirement age
  // Assessable assets = net worth minus PPOR (excluded from assets test)
  const lifeExp          = p(data.lifeExpectancy) || 90;
  const isCouple         = data.hasPartner === "yes";
  const isHomeowner      = data.homeOwnership === "owner" || data.homeOwnership === "mortgage";
  const atRetirementNW   = atRetirement?.netWorth || 0;
  const ppOrVal          = p(data.ppOrValue);
  const retirementAssets = Math.max(0, atRetirementNW + p(data.mortgageBalance) - ppOrVal);
  // Assessable income at retirement = drawdown target (conservative)
  const assessableIncome = p(data.targetRetirementSpending);
  const agePension       = estimateAgePension(isCouple, isHomeowner, retirementAssets, assessableIncome, retirementAge);
  // Also estimate at Age Pension eligibility age (67) if different from retirement
  const agePensionAt67   = retirementAge < AGE_PENSION.eligibilityAge
    ? estimateAgePension(isCouple, isHomeowner, retirementAssets, assessableIncome, AGE_PENSION.eligibilityAge)
    : agePension;

  // FIRE calculations
  const fire       = fireCalc(data, assumptions);
  const fireNumber = fire?.fireNumber || 0;

  // TTR (Transition to Retirement) — primary person only
  const ttr = calculateTTR(data, assumptions);

  return {
    assumptions,
    super:          superResult,
    drawdown,
    mortgage,
    trajectory,
    monteCarlo,
    propertyCashflows,
    householdTax,
    agePension:     agePensionAt67,
    fire,
    fireNumber,
    ttr,
    metrics: {
      retirementNetWorth:    atRetirement?.netWorth  ?? 0,
      finalNetWorth:         atEnd?.netWorth          ?? 0,
      superSurplus:          drawdown.surplus,
      onTrack:               drawdown.onTrack,
      depletionAge:          drawdown.depletionAge,
      lastsToLifeExpectancy: drawdown.lastsToLifeExpectancy,
      debtFreeYear:          mortgage?.debtFreeYear   ?? null,
      projectedSuper:        superResult.projectedBalance,
      requiredSuper:         drawdown.requiredBalance,
      annualHouseholdTax:    householdTax.totalHouseholdTax,
      annualAfterTax:        householdTax.totalAfterTax,
      negativeGearingBenefit: householdTax.negativeGearingBenefit,
      fireNumber,
      coastFireNumber:       fire?.coastFireNumber     ?? 0,
      isCoastFIRE:           fire?.isCoastFIRE         ?? false,
      yearsToFI:             fire?.yearsToFI           ?? null,
      projectedFIAge:        fire?.projectedFIAge      ?? null,
      bridgeYears:           fire?.bridgeYears         ?? 0,
      bridgeFundNeeded:      fire?.bridgeFundNeeded    ?? 0,
      estimatedAgePension:   agePensionAt67.estimatedAnnual,
      capExceeded:           drawdown.capExceeded,
    },
  };
}
