// Annual Budget XLSX export — Quiet Wealth brand styling
// Fonts: Georgia (≈ Spectral) for headings/totals · Calibri for body (Excel default)
import * as XLSX from "xlsx-js-style";
import { BUDGET_CATS, itemMonthly } from "./BudgetStage.jsx";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
  taupe:    "6B6655",
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
    numFmt: '$#,##0',
    alignment: { horizontal: "right", vertical: "center" },
  },
  amountLast: {
    font: { name: "Calibri", sz: 11, color: { rgb: C.ink } },
    numFmt: '$#,##0',
    alignment: { horizontal: "right", vertical: "center" },
    border: { bottom: { style: "hair", color: { rgb: C.stone } } },
  },
  annualAmt: {
    font: { name: "Georgia", sz: 12, color: { rgb: C.ink } },
    numFmt: '$#,##0',
    alignment: { horizontal: "right", vertical: "center" },
  },
  annualAmtLast: {
    font: { name: "Georgia", sz: 12, color: { rgb: C.ink } },
    numFmt: '$#,##0',
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
    numFmt: '$#,##0',
    alignment: { horizontal: "right", vertical: "center" },
    border: { top: { style: "thin", color: { rgb: C.stone } } },
  },
  totalAnnual: {
    font: { name: "Georgia", sz: 14, color: { rgb: C.pine }, bold: true },
    numFmt: '$#,##0',
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

export function exportBudgetXlsx(data) {
  const items = data.budgetItems || [];
  const name  = data.firstName ? `${data.firstName}'s Annual Budget` : "Annual Budget";
  const year  = new Date().getFullYear();
  const fyYear = `FY${year}`;

  const ws = {};
  const merges = [];
  let r = 0;

  function cell(row, c, value, style, type) {
    const addr = `${String.fromCharCode(65 + c)}${row + 1}`;
    ws[addr] = { v: value, t: type || (typeof value === "number" ? "n" : "s"), s: style };
  }

  function merge(row, c1, c2, rowEnd) {
    merges.push({ s: { r: row, c: c1 }, e: { r: rowEnd ?? row, c: c2 } });
  }

  const NCOLS = 15; // A=cat/item, B=item, C-N=Jan-Dec, O=Annual

  // ── Row 0: Brand label ────────────────────────────────────────────────────
  cell(r, 0, "INDEPENDENT MEANS", S.brandLabel);
  merge(r, 0, 10);
  cell(r, 11, "FINANCIAL YEAR", S.fyLabel);
  merge(r, 11, 14);
  r++;

  // ── Row 1: Title + FY ────────────────────────────────────────────────────
  cell(r, 0, name, S.title);
  merge(r, 0, 10);
  cell(r, 11, fyYear, S.fyValue);
  merge(r, 11, 14);
  r++;

  // ── Row 2: Blank separator ────────────────────────────────────────────────
  r++;

  // ── Row 3: Column headers ─────────────────────────────────────────────────
  cell(r, 0, "Category", S.colHeaderLeft);
  cell(r, 1, "Item",     S.colHeaderLeft);
  MONTHS.forEach((m, i) => cell(r, 2 + i, m, S.colHeader));
  cell(r, 14, "Annual", S.colHeaderAnnual);
  r++;

  // ── Category + item rows ──────────────────────────────────────────────────
  const monthTotals  = Array(12).fill(0);
  let   annualTotal  = 0;

  BUDGET_CATS.forEach(cat => {
    const catItems = items.filter(i => i.categoryKey === cat.key);
    if (catItems.length === 0) return;

    // Category header — span all columns
    cell(r, 0, cat.label, S.catRow);
    merge(r, 0, 14);
    for (let c = 1; c < NCOLS; c++) cell(r, c, "", S.catRow);
    r++;

    catItems.forEach((item, idx) => {
      const isLast    = idx === catItems.length - 1;
      const lblStyle  = isLast ? S.itemLabelLast  : S.itemLabel;
      const amtStyle  = isLast ? S.amountLast      : S.amount;
      const empStyle  = isLast ? S.emptyLast       : S.empty;
      const annStyle  = isLast ? S.annualAmtLast   : S.annualAmt;

      cell(r, 0, "", lblStyle);
      cell(r, 1, item.label, lblStyle);

      for (let m = 0; m < 12; m++) {
        const amt = itemAmountForMonth(item, m + 1);
        if (amt > 0) {
          cell(r, 2 + m, amt, amtStyle, "n");
          monthTotals[m] += amt;
        } else {
          cell(r, 2 + m, "", empStyle);
        }
      }

      const itemAnnual = itemMonthly(item) * 12;
      annualTotal += itemAnnual;
      cell(r, 14, itemAnnual, annStyle, "n");
      r++;
    });
  });

  // ── Blank spacer before totals ────────────────────────────────────────────
  r++;

  // ── Total row ─────────────────────────────────────────────────────────────
  cell(r, 0, "Total", S.totalLabel);
  cell(r, 1, "",      S.totalLabel);
  for (let m = 0; m < 12; m++) {
    cell(r, 2 + m, monthTotals[m] > 0 ? monthTotals[m] : "", S.totalAmt, monthTotals[m] > 0 ? "n" : "s");
  }
  cell(r, 14, annualTotal, S.totalAnnual, "n");
  r++;

  // ── Blank + disclaimer ────────────────────────────────────────────────────
  r++;
  cell(r, 0, "Exported from Independent Means. General information only. Not personal financial advice.", S.disclaimer);
  merge(r, 0, 14);
  r++;

  // ── Sheet metadata ────────────────────────────────────────────────────────
  ws["!ref"]    = `A1:O${r}`;
  ws["!merges"] = merges;
  ws["!cols"]   = [
    { wch: 20 },                   // A - Category
    { wch: 30 },                   // B - Item
    ...Array(12).fill({ wch: 10}), // C-N - Jan-Dec
    { wch: 13 },                   // O - Annual
  ];
  ws["!rows"] = [
    { hpt: 14 }, // brand label
    { hpt: 34 }, // title
    { hpt: 8  }, // blank
    { hpt: 22 }, // col headers
  ];

  // ── Workbook + download ───────────────────────────────────────────────────
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Annual Budget");

  const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "independent-means-annual-budget.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
