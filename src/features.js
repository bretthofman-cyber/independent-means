export const FEATURES = {
  MONTE_CARLO:        "monte_carlo",
  SCENARIO_COMPARE:   "scenario_comparison",
  CUSTOM_ASSUMPTIONS: "custom_assumptions",
  CARRY_FORWARD_CAP:  "carry_forward_cap",
  FRANKING_CREDITS:   "franking_credits",
  DEBT_RECYCLING:     "debt_recycling",
  PDF_EXPORT:         "pdf_export",
  STRATEGY_CENTRE:    "strategy_centre",
  CSV_EXPORT:         "csv_export",
};

export const TIERS = {
  FREE:    "free",
  TRIAL:   "trialing",
  PREMIUM: "active",
};

export const LIMITS = {
  free:     { maxPlans: 1, maxScenariosPerPlan: 1 },
  trialing: { maxPlans: Infinity, maxScenariosPerPlan: Infinity },
  active:   { maxPlans: Infinity, maxScenariosPerPlan: Infinity },
};

export const PREMIUM_FEATURES = new Set(Object.values(FEATURES));
