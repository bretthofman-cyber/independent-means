// Pure budget/income helpers — no React, safe to import from engine.js and test files.

export function itemMonthly(item) {
  if (item?.seasonal && Array.isArray(item?.monthlyAmounts)) {
    const p = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
    return item.monthlyAmounts.reduce((s, v) => s + p(v), 0) / 12;
  }
  const amount = parseFloat(String(item?.amount || "").replace(/,/g, "")) || 0;
  if (item?.frequency === "annual")    return amount / 12;
  if (item?.frequency === "quarterly") return amount / 3;
  return amount;
}

// Annual other-income split between primary person and partner.
// yourPct defaults to 100 (singles) or 50 (couples, set at item creation).
export function otherIncomeAnnual(data) {
  return (data.otherIncomeItems || []).reduce(
    (acc, item) => {
      const annual  = itemMonthly(item) * 12;
      const yourPct = (item.yourPct ?? 100) / 100;
      acc.yours   += annual * yourPct;
      acc.partner += annual * (1 - yourPct);
      return acc;
    },
    { yours: 0, partner: 0 }
  );
}
