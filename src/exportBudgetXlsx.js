// Annual Budget XLSX export — Quiet Wealth brand styling
// Fonts: Georgia (≈ Spectral) for headings/totals · Calibri for body (Excel default)
import { BUDGET_CATS } from "./budgetCats.js";
import { itemMonthly } from "./BudgetStage.jsx";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── FY period calculator ──────────────────────────────────────────────────────
// Returns the most recently started 12-month period beginning on startMonth.
// startMonth: 1-12 (default 7 = Australian FY Jul-Jun)
export function getFYInfo(startMonth = 7) {
  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // The period that started most recently (and includes or just preceded today)
  const startYear = currentMonth >= startMonth ? currentYear : currentYear - 1;

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const y = startYear + Math.floor((startMonth - 1 + i) / 12);
    return { month: m, year: y, short: MONTH_SHORT[m - 1] };
  });

  const { month: endMonth, year: endYear } = months[11];

  let label;
  if (startMonth === 7) {
    // Australian standard: FY2026-27
    label = `FY${startYear}-${String(startYear + 1).slice(-2)}`;
  } else if (startMonth === 1) {
    // Calendar year: 2026
    label = String(startYear);
  } else {
    label = `${MONTH_SHORT[startMonth - 1]} ${startYear}–${MONTH_SHORT[endMonth - 1]} ${endYear}`;
  }

  const range    = `${MONTH_SHORT[startMonth - 1]} – ${MONTH_SHORT[endMonth - 1]}`;
  const safeLabel = label.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase().replace(/-+/g, "-");
  const filename  = `independent-means-budget-${safeLabel}.xlsx`;

  return { months, label, range, filename, startYear, endMonth, endYear };
}

// Amount this item contributes in a given calendar month (1-indexed).
// Smooths annual/quarterly items that have no assigned month.
function itemAmountForMonth(item, monthNum) {
  const amount = parseFloat(String(item?.amount || "").replace(/,/g, "")) || 0;
  if (!amount) return 0;
  switch (item.frequency) {
    case "monthly":   return amount;
    case "annual":    return item.month
      ? (parseInt(item.month) === monthNum ? amount : 0)
      : amount / 12;
    case "quarterly": return item.month
      ? (((monthNum - parseInt(item.month) + 12) % 3) === 0 ? amount : 0)
      : amount / 3;
    default:          return 0;
  }
}

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  pine:     "2E4A3D",
  gold:     "C2A06B",
  ink:      "21241E",
  stone:    "D8D2C4",
  sage:     "9DB0A1",
  warmGray: "8A8270",
};

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  brandLabel: {
    font: { name: "Calibri", sz: 8, color: { rgb: C.sage } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  title: {
    font: { name: "Georgia", sz: 22, color: { rgb: C.ink }, bold: false },
    alignment: { horizontal: "left", vertical: "bottom" },
  },
  fyLabel: {
    font: { name: "Calibri", sz: 8, color: { rgb: C.warmGray } },
    alignment: { horizontal: "right", vertical: "center" },
  },
  fyValue: {
    font: { name: "Georgia", sz: 13, color: { rgb: C.ink } },
    alignment: { horizontal: "right", vertical: "center" },
  },
  colHeader: {
    font: { name: "Calibri", sz: 9, color: { rgb: C.warmGray } },
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: C.stone } } },
  },
  colHeaderLeft: {
    font: { name: "Calibri", sz: 9, color: { rgb: C.warmGray } },
    alignment: { horizontal: "left", vertical: "center" },
    border: { bottom: { style: "thin", color: { rgb: C.stone } } },
  },
  colHeaderAnnual: {
    font: { name: "Calibri", sz: 9, color: { rgb: C.pine }, bold: true },
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "medium", color: { rgb: C.gold } } },
  },
  catRow: {
    font: { name: "Georgia", sz: 11, color: { rgb: C.pine } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  itemLabel: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.ink } },
    alignment: { horizontal: "left", vertical: "center", indent: 1 },
  },
  itemLabelLast: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.ink } },
    alignment: { horizontal: "left", vertical: "center", indent: 1 },
    border: { bottom: { style: "hair", color: { rgb: C.stone } } },
  },
  amount: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.ink } },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
  },
  amountLast: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.ink } },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "hair", color: { rgb: C.stone } } },
  },
  annualAmt: {
    font: { name: "Georgia", sz: 12, color: { rgb: C.ink } },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
  },
  annualAmtLast: {
    font: { name: "Georgia", sz: 12, color: { rgb: C.ink } },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "hair", color: { rgb: C.stone } } },
  },
  totalLabel: {
    font: { name: "Georgia", sz: 13, color: { rgb: C.ink }, bold: true },
    alignment: { horizontal: "left", vertical: "center" },
    border: { top: { style: "thin", color: { rgb: C.stone } } },
  },
  totalAmt: {
    font: { name: "Georgia", sz: 11, color: { rgb: C.ink }, bold: true },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
    border: { top: { style: "thin", color: { rgb: C.stone } } },
  },
  totalAnnual: {
    font: { name: "Georgia", sz: 14, color: { rgb: C.pine }, bold: true },
    numFmt: "$#,##0",
    alignment: { horizontal: "right", vertical: "center" },
    border: { top: { style: "medium", color: { rgb: C.gold } } },
  },
  disclaimer: {
    font: { name: "Calibri", sz: 9, color: { rgb: C.warmGray }, italic: true },
    alignment: { horizontal: "left", vertical: "center" },
  },
  empty: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.stone } },
    alignment: { horizontal: "right", vertical: "center" },
  },
  emptyLast: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.stone } },
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "hair", color: { rgb: C.stone } } },
  },
};

export async function exportBudgetXlsx(data, startMonth = 7) {
  const items  = data.budgetItems || [];
  const name   = data.firstName ? `${data.firstName}'s Annual Budget` : "Annual Budget";
  const fyInfo = getFYInfo(startMonth);

  const ws     = {};
  const merges = [];
  let r = 0;

  function cell(row, c, value, style, type) {
    const addr = `${String.fromCharCode(65 + c)}${row + 1}`;
    ws[addr] = { v: value, t: type || (typeof value === "number" ? "n" : "s"), s: style };
  }

  function merge(row, c1, c2) {
    merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } });
  }

  const NCOLS = 15; // A=cat, B=item, C-N=12 months, O=Annual

  // ── Row 0: Brand label ────────────────────────────────────────────────────
  cell(r, 0, "INDEPENDENT MEANS", S.brandLabel);
  merge(r, 0, 10);
  cell(r, 11, "FINANCIAL YEAR", S.fyLabel);
  merge(r, 11, 14);
  r++;

  // ── Row 1: Title + FY label ───────────────────────────────────────────────
  cell(r, 0, name, S.title);
  merge(r, 0, 10);
  cell(r, 11, fyInfo.label, S.fyValue);
  merge(r, 11, 14);
  r++;

  // ── Row 2: Blank separator ────────────────────────────────────────────────
  r++;

  // ── Row 3: Column headers — months ordered by FY start ───────────────────
  cell(r, 0, "Category", S.colHeaderLeft);
  cell(r, 1, "Item",     S.colHeaderLeft);
  fyInfo.months.forEach((mo, i) => cell(r, 2 + i, mo.short, S.colHeader));
  cell(r, 14, "Annual", S.colHeaderAnnual);
  r++;

  // ── Category + item rows ──────────────────────────────────────────────────
  const monthTotals = Array(12).fill(0);
  let   annualTotal = 0;

  BUDGET_CATS.forEach(cat => {
    const catItems = items.filter(i => i.categoryKey === cat.key);
    if (catItems.length === 0) return;

    // Category header spanning all columns
    cell(r, 0, cat.label, S.catRow);
    merge(r, 0, 14);
    for (let c = 1; c < NCOLS; c++) cell(r, c, "", S.catRow);
    r++;

    catItems.forEach((item, idx) => {
      const isLast   = idx === catItems.length - 1;
      const lblStyle = isLast ? S.itemLabelLast : S.itemLabel;
      const amtStyle = isLast ? S.amountLast    : S.amount;
      const empStyle = isLast ? S.emptyLast      : S.empty;
      const annStyle = isLast ? S.annualAmtLast  : S.annualAmt;

      cell(r, 0, "", lblStyle);
      cell(r, 1, item.label, lblStyle);

      // Iterate months in FY order
      fyInfo.months.forEach((mo, i) => {
        const amt = itemAmountForMonth(item, mo.month);
        if (amt > 0) {
          cell(r, 2 + i, amt, amtStyle, "n");
          monthTotals[i] += amt;
        } else {
          cell(r, 2 + i, "", empStyle);
        }
      });

      const itemAnnual = itemMonthly(item) * 12;
      annualTotal += itemAnnual;
      cell(r, 14, itemAnnual, annStyle, "n");
      r++;
    });
  });

  // ── Spacer before totals ──────────────────────────────────────────────────
  r++;

  // ── Total row ─────────────────────────────────────────────────────────────
  cell(r, 0, "Total", S.totalLabel);
  cell(r, 1, "",      S.totalLabel);
  for (let i = 0; i < 12; i++) {
    cell(r, 2 + i, monthTotals[i] > 0 ? monthTotals[i] : "", S.totalAmt,
      monthTotals[i] > 0 ? "n" : "s");
  }
  cell(r, 14, annualTotal, S.totalAnnual, "n");
  r++;

  // ── Blank + disclaimer ────────────────────────────────────────────────────
  r++;
  cell(r, 0,
    "Exported from Independent Means. General information only. Not personal financial advice.",
    S.disclaimer);
  merge(r, 0, 14);
  r++;

  // ── Sheet metadata ────────────────────────────────────────────────────────
  ws["!ref"]    = `A1:O${r}`;
  ws["!merges"] = merges;
  ws["!cols"]   = [
    { wch: 20 },
    { wch: 30 },
    ...Array(12).fill({ wch: 10 }),
    { wch: 13 },
  ];
  ws["!rows"] = [
    { hpt: 14 },
    { hpt: 34 },
    { hpt: 8  },
    { hpt: 22 },
  ];

  // ── Workbook + download ───────────────────────────────────────────────────
  const { default: XLSX } = await import("xlsx-js-style");
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Annual Budget");
  const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = fyInfo.filename;
  a.click();
  URL.revokeObjectURL(url);
}
