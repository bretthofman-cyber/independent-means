/**
 * Life Events — data model and engine helpers.
 *
 * A life event modifies the year-by-year cashflow projection without
 * changing the user's baseline scenario. Events layer on top of the
 * existing income, savings, and asset assumptions.
 *
 * Events are stored in data.lifeEvents[] and processed in netWorthTrajectory().
 */

export const LIFE_EVENT_TYPES = {
  career_break: {
    label: "Career break",
    description: "Full or partial income pause",
    icon: "⏸",
    personed: true,         // applies to a specific person
    durable: true,          // spans multiple years
    fields: ["person", "year", "durationYears", "incomeReductionPct"],
    defaults: { durationYears: "2", incomeReductionPct: "100" },
    hint: "Models zero or reduced income and proportional reduction in super contributions for the period.",
  },
  part_time: {
    label: "Part-time transition",
    description: "Reduced hours and income",
    icon: "⏱",
    personed: true,
    durable: true,
    fields: ["person", "year", "durationYears", "incomeReductionPct"],
    defaults: { durationYears: "3", incomeReductionPct: "50" },
    hint: "Models reduced income and proportional super contributions for the duration.",
  },
  windfall: {
    label: "Windfall / inheritance",
    description: "One-off lump sum received",
    icon: "💰",
    personed: false,
    durable: false,
    fields: ["year", "amount"],
    defaults: { amount: "" },
    hint: "Added to liquid assets in the modelled year. Does not include tax treatment of inheritance (generally not taxable in Australia).",
  },
  major_expense: {
    label: "Major expense",
    description: "One-off large spending event",
    icon: "🏗",
    personed: false,
    durable: false,
    fields: ["year", "amount", "customLabel"],
    defaults: { amount: "", customLabel: "Major expense" },
    hint: "Deducted from liquid assets in the modelled year (e.g. renovation, car purchase, medical).",
  },
  school_fees: {
    label: "School / university fees",
    description: "Annual education costs",
    icon: "🎓",
    personed: false,
    durable: true,
    fields: ["year", "durationYears", "amount"],
    defaults: { amount: "", durationYears: "6" },
    hint: "Annual amount deducted from liquid assets for each year of the duration.",
  },
  redundancy: {
    label: "Redundancy / payout",
    description: "Lump-sum payout plus income pause",
    icon: "📋",
    personed: true,
    durable: false,
    fields: ["person", "year", "amount", "pauseMonths"],
    defaults: { amount: "", pauseMonths: "6" },
    hint: "Lump sum added to liquid assets. Income reduced proportionally for the pause period. Tax on genuine redundancy payments is not modelled. This is illustrative only.",
  },
  extra_repayment: {
    label: "Lump-sum mortgage repayment",
    description: "Extra principal payment",
    icon: "🏠",
    personed: false,
    durable: false,
    fields: ["year", "amount"],
    defaults: { amount: "" },
    hint: "Applied directly to PPOR mortgage principal in the modelled year, reducing the outstanding balance and future interest.",
  },
  downsize: {
    label: "Downsize / sell PPOR",
    description: "Sell home, net proceeds to investments",
    icon: "📐",
    personed: false,
    durable: false,
    fields: ["year", "amount"],
    defaults: { amount: "" },
    hint: "Net proceeds (after buying a smaller home) added to liquid assets. Does not model CGT (PPOR is generally exempt) or Downsizer Contribution to super. Consult an adviser for downsizer contribution strategy.",
  },
  ip_sale: {
    label: "Sell investment property",
    description: "CGT estimated on sale proceeds",
    icon: "🏷",
    personed: false,
    durable: false,
    fields: ["year", "amount", "costBase", "heldOver12Months"],
    defaults: { amount: "", costBase: "", heldOver12Months: "yes" },
    hint: "Net proceeds after estimated CGT (50% discount if held >12 months at 30% marginal rate estimate) are added to liquid assets.",
  },
  travel_retirement: {
    label: "Travel in retirement",
    description: "Annual travel budget during retirement",
    icon: "✈️",
    personed: false,
    durable: true,
    fields: ["year", "durationYears", "amount"],
    defaults: { amount: "", durationYears: "10" },
    hint: "Annual travel budget modelled as a recurring cash outflow for the duration entered.",
  },
  inheritance_gift: {
    label: "Leave an inheritance",
    description: "Planned estate gift or wealth transfer",
    icon: "🏡",
    personed: false,
    durable: false,
    fields: ["year", "amount"],
    defaults: { amount: "" },
    hint: "Modelled as a lump-sum outflow in the selected year. Does not model tax treatment (estate planning consult recommended).",
  },
  business_investment: {
    label: "Start or invest in a business",
    description: "Capital investment in a business",
    icon: "💼",
    personed: false,
    durable: false,
    fields: ["year", "amount"],
    defaults: { amount: "" },
    hint: "Investment amount deducted from liquid assets in the modelled year. Does not model returns from the business.",
  },
  charity_giving: {
    label: "Give to charity or causes",
    description: "Planned charitable giving",
    icon: "❤️",
    personed: false,
    durable: true,
    fields: ["year", "durationYears", "amount"],
    defaults: { amount: "", durationYears: "5" },
    hint: "Annual giving amount, modelled as a recurring cash outflow each year for the duration.",
  },
};

/**
 * Create a new life event object with sensible defaults.
 * @param {string} type  One of LIFE_EVENT_TYPES keys
 */
export function newLifeEvent(type) {
  const meta = LIFE_EVENT_TYPES[type] || {};
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    year: String(new Date().getFullYear() + 3),
    person: "primary",          // "primary" | "partner" | "both"
    amount: meta.defaults?.amount ?? "",
    durationYears: meta.defaults?.durationYears ?? "1",
    incomeReductionPct: meta.defaults?.incomeReductionPct ?? "100",
    pauseMonths: meta.defaults?.pauseMonths ?? "3",
    customLabel: meta.defaults?.customLabel ?? "",
    costBase: meta.defaults?.costBase ?? "",
    heldOver12Months: meta.defaults?.heldOver12Months ?? "yes",
  };
}

/**
 * Index life events by calendar year (durable events repeat for each year of their duration).
 * Called inside the engine to process events per year.
 *
 * @param {Array} lifeEvents  data.lifeEvents array
 * @returns {Map<number, object[]>}  Map of calYear → events active in that year
 */
export function indexEventsByYear(lifeEvents) {
  const map = new Map();
  const durableTypes = new Set(["career_break", "part_time", "school_fees", "travel_retirement", "charity_giving"]);

  for (const evt of lifeEvents || []) {
    const startYear = parseInt(evt.year) || 0;
    if (!startYear) continue;

    const dur = durableTypes.has(evt.type) ? Math.max(1, parseInt(evt.durationYears) || 1) : 1;

    // Redundancy: lump sum in year 0, income pause for pauseMonths
    // Treat as non-durable for now (lump sum once), income effect handled separately
    for (let d = 0; d < dur; d++) {
      const yr = startYear + d;
      if (!map.has(yr)) map.set(yr, []);
      map.get(yr).push({ ...evt, _durOffset: d });
    }
  }

  return map;
}

/**
 * Compute the income multiplier and lump-sum adjustments for a given calendar year.
 *
 * @param {number} calYear      Calendar year being processed
 * @param {Map}    eventMap     Output of indexEventsByYear()
 * @param {number} incRatio     gross1 / (gross1 + gross2) — used for partner-specific events
 * @param {number} marginalRate Estimated marginal tax rate for CGT calculation (default 0.30)
 * @returns {{ incomeMult: number, lumpIn: number, lumpOut: number, extraMortgageRepay: number, eventTypes: string[] }}
 */
export function getYearEventAdjustments(calYear, eventMap, incRatio = 0.5, marginalRate = 0.30) {
  const events = eventMap.get(calYear) || [];
  let incomeMult = 1;
  let lumpIn = 0;
  let lumpOut = 0;
  let extraMortgageRepay = 0;
  const eventTypes = [];

  for (const evt of events) {
    eventTypes.push(evt.type);
    const amt = parseFloat(String(evt.amount || "").replace(/,/g, "")) || 0;

    switch (evt.type) {
      case "career_break":
      case "part_time": {
        const reductionPct = parseFloat(evt.incomeReductionPct) || 100;
        const reduction = reductionPct / 100;
        // Apply to whole household or just one person
        if (evt.person === "primary") {
          incomeMult *= (1 - reduction * incRatio);
        } else if (evt.person === "partner") {
          incomeMult *= (1 - reduction * (1 - incRatio));
        } else {
          incomeMult *= (1 - reduction);
        }
        break;
      }
      case "windfall":
      case "downsize":
        lumpIn += amt;
        break;
      case "redundancy":
        // Lump sum only in the start year
        if (evt._durOffset === 0) lumpIn += amt;
        // Income effect in first (pauseMonths/12) of a year
        if (evt._durOffset === 0) {
          const pauseFraction = Math.min(1, (parseInt(evt.pauseMonths) || 3) / 12);
          if (evt.person === "primary") {
            incomeMult *= (1 - pauseFraction * incRatio);
          } else if (evt.person === "partner") {
            incomeMult *= (1 - pauseFraction * (1 - incRatio));
          } else {
            incomeMult *= (1 - pauseFraction);
          }
        }
        break;
      case "major_expense":
      case "school_fees":
      case "travel_retirement":
      case "charity_giving":
        lumpOut += amt;
        break;
      case "inheritance_gift":
      case "business_investment":
        if (evt._durOffset === 0) lumpOut += amt;
        break;
      case "extra_repayment":
        if (evt._durOffset === 0) extraMortgageRepay += amt;
        break;
      case "ip_sale": {
        if (evt._durOffset === 0) {
          const costBase = parseFloat(String(evt.costBase || "").replace(/,/g, "")) || 0;
          const gain = Math.max(0, amt - costBase);
          const discount = evt.heldOver12Months !== "no" ? 0.5 : 1;
          const taxableGain = gain * discount;
          const cgt = taxableGain * marginalRate;
          lumpIn += amt - cgt;
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    incomeMult: Math.max(0, incomeMult),
    lumpIn,
    lumpOut,
    extraMortgageRepay,
    eventTypes,
  };
}
