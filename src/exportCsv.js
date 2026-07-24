import { runEngine } from "./engine.js";

function csvEncode(rows) {
  return rows
    .map(row =>
      row
        .map(cell => {
          const s = String(cell ?? "");
          return s.includes(",") || s.includes("\n") || s.includes('"')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
    )
    .join("\n");
}

function triggerDownload(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PLAN DATA EXPORT ─────────────────────────────────────────────────────────
// Columns map 1:1 to camelCase EMPTY_DATA keys (snake_case → camelCase for import).
// Arrays are JSON-encoded for round-trip import.

const PLAN_HEADERS = [
  "first_name", "age", "has_partner", "partner_name", "partner_age",
  "partner_retirement_age", "dependants", "dependant_ages_json", "location",
  "employment_status", "partner_employment_status",
  "retirement_age", "life_expectancy", "home_ownership",
  "private_health_insurance", "partner_private_health_insurance",
  "gross_income", "partner_income", "bonus_income", "other_income",
  "partner_bonus_income", "partner_other_income",
  "monthly_expenses", "annual_irregular", "savings_per_month",
  "emergency_fund",
  "ppor_value", "ppor_ownership_pct",
  "mortgage_balance", "mortgage_rate", "loan_type",
  "mortgage_start_year", "mortgage_tenure", "mortgage_io_expiry_year",
  "ppor_offset_balance",
  "credit_card_debt", "personal_loan_debt", "hecs_debt",
  "partner_credit_card_debt", "partner_personal_loan_debt", "partner_hecs_debt",
  "super_balance", "partner_super_balance",
  "personal_super_contribs", "partner_personal_super_contribs",
  "employer_sg_rate", "partner_employer_sg_rate",
  "salary_sacrifice", "partner_salary_sacrifice",
  "carry_forward_cap", "partner_carry_forward_cap",
  "franking_credits", "partner_franking_credits",
  "insurance_premium", "insurance_in_super",
  "partner_insurance_premium", "partner_insurance_in_super",
  "debt_recycling", "target_retirement_spending",
  "retirement_lifestyle", "risk_tolerance", "active_scenario",
  "budget_items_json", "asset_items_json",
  "investment_properties_json", "life_events_json",
];

const PLAN_FIELD_MAP = {
  first_name:                     d => d.firstName,
  age:                            d => d.age,
  has_partner:                    d => d.hasPartner,
  partner_name:                   d => d.partnerName,
  partner_age:                    d => d.partnerAge,
  partner_retirement_age:         d => d.partnerRetirementAge,
  dependants:                     d => d.dependants,
  dependant_ages_json:            d => JSON.stringify(d.dependantAges || []),
  location:                       d => d.location,
  employment_status:              d => d.employmentStatus,
  partner_employment_status:      d => d.partnerEmploymentStatus,
  retirement_age:                 d => d.retirementAge,
  life_expectancy:                d => d.lifeExpectancy,
  home_ownership:                 d => d.homeOwnership,
  private_health_insurance:       d => d.privateHealthInsurance,
  partner_private_health_insurance: d => d.partnerPrivateHealthInsurance,
  gross_income:                   d => d.grossIncome,
  partner_income:                 d => d.partnerIncome,
  bonus_income:                   d => d.bonusIncome,
  other_income:                   d => d.otherIncome,
  partner_bonus_income:           d => d.partnerBonusIncome,
  partner_other_income:           d => d.partnerOtherIncome,
  monthly_expenses:               d => d.monthlyExpenses,
  annual_irregular:               d => d.annualIrregular,
  savings_per_month:              d => d.savingsPerMonth,
  emergency_fund:                 d => d.emergencyFund,
  ppor_value:                     d => d.ppOrValue,
  ppor_ownership_pct:             d => d.ppOrOwnershipPct,
  mortgage_balance:               d => d.mortgageBalance,
  mortgage_rate:                  d => d.mortgageRate,
  loan_type:                      d => d.loanType,
  mortgage_start_year:            d => d.mortgageStartYear,
  mortgage_tenure:                d => d.mortgageTenure,
  mortgage_io_expiry_year:        d => d.mortgageIoExpiryYear,
  ppor_offset_balance:            d => d.ppOrOffsetBalance,
  credit_card_debt:               d => d.creditCardDebt,
  personal_loan_debt:             d => d.personalLoanDebt,
  hecs_debt:                      d => d.hecsDebt,
  partner_credit_card_debt:       d => d.partnerCreditCardDebt,
  partner_personal_loan_debt:     d => d.partnerPersonalLoanDebt,
  partner_hecs_debt:              d => d.partnerHecsDebt,
  super_balance:                  d => d.superBalance,
  partner_super_balance:          d => d.partnerSuperBalance,
  personal_super_contribs:        d => d.personalSuperContribs,
  partner_personal_super_contribs: d => d.partnerPersonalSuperContribs,
  employer_sg_rate:               d => d.employerSgRate,
  partner_employer_sg_rate:       d => d.partnerEmployerSgRate,
  salary_sacrifice:               d => d.salarySacrifice,
  partner_salary_sacrifice:       d => d.partnerSalarySacrifice,
  carry_forward_cap:              d => d.carryForwardCap,
  partner_carry_forward_cap:      d => d.partnerCarryForwardCap,
  franking_credits:               d => d.frankingCredits,
  partner_franking_credits:       d => d.partnerFrankingCredits,
  insurance_premium:              d => d.insurancePremium,
  insurance_in_super:             d => d.insuranceInSuper,
  partner_insurance_premium:      d => d.partnerInsurancePremium,
  partner_insurance_in_super:     d => d.partnerInsuranceInSuper,
  debt_recycling:                 d => String(d.debtRecycling ?? "false"),
  target_retirement_spending:     d => d.targetRetirementSpending,
  retirement_lifestyle:           d => d.retirementLifestyle,
  risk_tolerance:                 d => d.riskTolerance,
  active_scenario:                d => d.activeScenario,
  budget_items_json:              d => JSON.stringify(d.budgetItems || []),
  asset_items_json:               d => JSON.stringify(d.assetItems || []),
  investment_properties_json:     d => JSON.stringify(d.investmentProperties || []),
  life_events_json:               d => JSON.stringify(d.lifeEvents || []),
};

export function planDataCsvRows(data) {
  const row = PLAN_HEADERS.map(h => {
    const val = PLAN_FIELD_MAP[h]?.(data) ?? "";
    return String(val ?? "");
  });
  return [PLAN_HEADERS, row];
}

export function exportPlanDataCsv(data) {
  triggerDownload("independent-means-plan.csv", csvEncode(planDataCsvRows(data)));
}

// ─── PROJECTION EXPORT ────────────────────────────────────────────────────────
// derivedData: data with assetItems already flattened (cashSavings etc. present).
// baseEngine: already-computed engine for the active scenario.
// withScenarios: when true, also runs conservative + aggressive and adds columns.

const BASE_PROJ_HEADERS = [
  "age", "year", "net_worth", "super_balance",
  "liquid_assets", "property_value", "total_debt", "is_retired",
];

export function projectionCsvRows(derivedData, baseEngine, withScenarios) {
  const trajectory = baseEngine?.trajectory;
  if (!trajectory || trajectory.length === 0) return [BASE_PROJ_HEADERS];

  let consTrajectory = null;
  let aggTrajectory  = null;

  if (withScenarios) {
    const consEngine = runEngine(
      { ...derivedData, activeScenario: "conservative" },
      { skipMonteCarlo: true, skipAdvancedTax: true }
    );
    const aggEngine = runEngine(
      { ...derivedData, activeScenario: "aggressive" },
      { skipMonteCarlo: true, skipAdvancedTax: true }
    );
    consTrajectory = consEngine?.trajectory ?? null;
    aggTrajectory  = aggEngine?.trajectory  ?? null;
  }

  const headers = withScenarios
    ? [
        ...BASE_PROJ_HEADERS.map(h => h === "net_worth" ? "base_net_worth" : h),
        "conservative_net_worth", "aggressive_net_worth",
      ]
    : BASE_PROJ_HEADERS;

  const rows = trajectory.map((pt, i) => {
    const base = [
      pt.age,
      pt.year,
      pt.netWorth,
      pt.superBalance,
      pt.liquidAssets,
      pt.propertyValue,
      pt.totalDebt,
      pt.isRetired ? "true" : "false",
    ];
    if (withScenarios) {
      base.push(
        consTrajectory?.[i]?.netWorth ?? "",
        aggTrajectory?.[i]?.netWorth  ?? ""
      );
    }
    return base;
  });

  return [headers, ...rows];
}

export function exportProjectionCsv(derivedData, baseEngine, withScenarios) {
  triggerDownload(
    "independent-means-projection.csv",
    csvEncode(projectionCsvRows(derivedData, baseEngine, withScenarios))
  );
}
