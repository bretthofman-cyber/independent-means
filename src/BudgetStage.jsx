// ─── CLEARPATH — STAGE 2: INCOME & CASHFLOW (ITEM-LEVEL BUDGET) ──────────────

import { useState, useRef, useEffect } from "react";
import { currency, Field, Input, TwoCol, SectionDivider } from "./ui.jsx";

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

export const BUDGET_CATS = [
  { key: "housing",       label: "Housing",                       icon: "🏠" },
  { key: "utilities",     label: "Utilities & bills",             icon: "⚡" },
  { key: "groceries",     label: "Groceries & food",              icon: "🛒" },
  { key: "transport",     label: "Transport",                     icon: "🚗" },
  { key: "insurance",     label: "Insurance",                     icon: "🛡️" },
  { key: "health",        label: "Health & medical",              icon: "🏥" },
  { key: "sport",         label: "Sport & recreation",            icon: "🏆" },
  { key: "children",      label: "Children & education",          icon: "🎓" },
  { key: "entertainment", label: "Entertainment & subscriptions", icon: "🎬" },
  { key: "personal",      label: "Personal & memberships",        icon: "👕" },
  { key: "other",         label: "Other",                         icon: "📦" },
];

const BUDGET_SUGGESTIONS = {
  housing: [
    "Mortgage repayment", "Rent", "Council rates", "Body corp / strata fees",
    "Water & sewerage", "Home maintenance", "Cleaning service", "Pest control", "Lawn & garden",
  ],
  utilities: [
    "Electricity", "Gas", "Internet / broadband", "Mobile phone",
    "Home phone", "Device plan / wearable (Apple Watch etc.)", "Other utilities",
  ],
  groceries: [
    "Supermarket & groceries", "Takeout & food delivery", "Coffee & cafes",
    "Specialty food / butcher / deli", "Alcohol & beverages",
  ],
  transport: [
    "Fuel", "Public transport", "Car registration & CTP greenslip",
    "Comprehensive car insurance", "Car servicing & repairs",
    "Car loan repayment", "Roadside assistance (NRMA etc.)",
    "Parking & tolls", "Rideshare / taxi",
  ],
  insurance: [
    "Private health insurance", "Home & contents insurance",
    "Life insurance", "Income protection insurance",
    "Device insurance (AppleCare etc.)", "Travel insurance",
  ],
  health: [
    "GP & doctors", "Dentist", "Pharmacy & prescriptions",
    "Physiotherapy / allied health", "Optometrist", "Specialist",
    "Yoga / Pilates classes", "Mental health / psychology",
    "Naturopath / alternative health",
  ],
  sport: [
    "Sport club registration / fees", "Association registration (Rugby, SANFL, cricket etc.)",
    "Gym / fitness membership", "Sport membership (Wallabies, SACA etc.)",
    "After-school sport programs", "Coaching & training fees",
    "Sport equipment & apparel", "Race / event entry fees", "Swimming lessons",
  ],
  children: [
    "School fees", "Childcare / daycare", "After-school care / OSHC",
    "Tutoring", "Music lessons", "Dance lessons", "Art / drama classes",
    "School excursions & camps", "Uniforms & school supplies", "Pocket money",
  ],
  entertainment: [
    "Netflix", "Stan", "Disney+", "Amazon Prime / Prime Video",
    "Apple TV+ / Apple One", "Kayo Sports / Foxtel", "Binge",
    "Spotify / Apple Music", "PlayStation Plus / Xbox Game Pass",
    "AMC+", "BritBox", "Paramount+", "Crunchyroll", "HBO Go",
    "Duolingo", "NY Times / news subscriptions",
    "Dining out", "Bars & drinks", "Events & concerts",
    "Hobbies & crafts", "Books & magazines",
  ],
  personal: [
    "Clothing & shoes", "Haircuts & grooming", "Beauty & cosmetics",
    "Personal care products", "Dry cleaning & alterations",
    "Gifts (birthdays, Christmas etc.)", "Pet expenses",
  ],
  other: [
    "Charitable donations", "Travel & holidays",
    "Accountant / financial advice", "Bank & account fees",
    "Home office costs", "Miscellaneous",
  ],
};

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// FY2026-27 Australian resident income tax rates
// Brackets: $0–$18,200 Nil | $18,201–$45,000 16c | $45,001–$135,000 30c |
//           $135,001–$190,000 37c | $190,001+ 45c  (+2% Medicare levy)
// Note: compiled ATO figures ($4,288 / $31,288 / $51,638) confirm 16c for the
//       bottom bracket; LITO unchanged from Stage 3 (max $700, phases to $0 at $66,667).
function annualTax(grossIncome) {
  const g = Math.max(0, parseFloat(String(grossIncome).replace(/,/g, "")) || 0);
  if (!g) return 0;
  let tax = 0;
  // Income tax — FY2026-27 brackets
  if (g > 18200)  tax += (Math.min(g, 45000)  - 18200)  * 0.16;  // 16c
  if (g > 45000)  tax += (Math.min(g, 135000) - 45000)  * 0.30;  // 30c
  if (g > 135000) tax += (Math.min(g, 190000) - 135000) * 0.37;  // 37c
  if (g > 190000) tax += (g - 190000) * 0.45;                    // 45c
  // Medicare levy — 2% on all income (threshold irrelevant for target users)
  tax += g * 0.02;
  // Low Income Tax Offset (LITO) — max $700, fully phases out at $66,667
  if (g <= 37500)      tax -= 700;
  else if (g <= 45000) tax -= Math.max(0, 700 - (g - 37500) * 0.05);
  else if (g <= 66667) tax -= Math.max(0, 325 - (g - 45000) * 0.015);
  return Math.max(0, Math.round(tax));
}

export function estimateNetMonthly(data) {
  const n = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const g1 = Math.max(0, n(data.grossIncome) - n(data.salarySacrifice));
  const g2 = data.hasPartner === "yes" ? n(data.partnerIncome) : 0;
  const net1 = g1 - annualTax(g1);
  const net2 = g2 - annualTax(g2);
  const bonus = (n(data.bonusIncome) + n(data.otherIncome)) * 0.75;
  return Math.max(0, Math.round((net1 + net2 + bonus) / 12));
}

export function itemMonthly(item) {
  const amount = parseFloat(String(item?.amount || "").replace(/,/g, "")) || 0;
  if (item?.frequency === "annual")    return amount / 12;
  if (item?.frequency === "quarterly") return amount / 3;
  return amount;
}

export function budgetTotal(items) {
  return (items || []).reduce((sum, item) => sum + itemMonthly(item), 0);
}

// ─── CASHFLOW CALENDAR LOGIC ──────────────────────────────────────────────────

// Builds 12 monthly rows from budget items + income.
// Annual items WITH a month → spike in that exact month.
// Quarterly items WITH a month → spike in months M, M+3, M+6, M+9.
// Annual/quarterly WITHOUT a month → smoothed into fixedMonthly (÷12 or ÷3).
export function buildCashflowCalendar(items, netMonthlyIncome, startingCash = 0) {
  const p = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const all = items || [];
  const monthlyItems      = all.filter(i => i.frequency === "monthly");
  const annualWithMonth   = all.filter(i => i.frequency === "annual"    && i.month);
  const annualNoMonth     = all.filter(i => i.frequency === "annual"    && !i.month);
  const quarterlyWithMonth= all.filter(i => i.frequency === "quarterly" && i.month);
  const quarterlyNoMonth  = all.filter(i => i.frequency === "quarterly" && !i.month);

  const fixedMonthly =
    monthlyItems.reduce((s, i) => s + p(i.amount), 0) +
    annualNoMonth.reduce((s, i) => s + p(i.amount) / 12, 0) +
    quarterlyNoMonth.reduce((s, i) => s + p(i.amount) / 3, 0);

  let cumulative = startingCash;
  return MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    const annSpikes = annualWithMonth.filter(i => parseInt(i.month) === monthNum);
    // Quarterly: hits if (monthNum - startMonth) mod 3 === 0
    const qtrSpikes = quarterlyWithMonth.filter(i => ((monthNum - parseInt(i.month) + 12) % 3) === 0);
    const spikes    = [...annSpikes, ...qtrSpikes];
    const annualDue = spikes.reduce((s, i) => s + p(i.amount), 0);
    const net = netMonthlyIncome - fixedMonthly - annualDue;
    cumulative += net;
    return { name, short: MONTH_SHORT[idx], income: netMonthlyIncome, fixed: fixedMonthly, annual: annualDue, spikes, net, cumulative };
  });
}

function newItem(categoryKey, label, amount = "", frequency = "monthly", month = null) {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    categoryKey, label, amount, frequency, month,
  };
}

// ─── CASHFLOW SUMMARY ─────────────────────────────────────────────────────────

function CashflowSummary({ netMonthly, expenses, savings, surplus }) {
  const isPos = surplus >= 0;
  const color = isPos ? "#3d6b5e" : "#9a3922";
  const bg    = isPos ? "#eaf2ef" : "#fdf4f0";
  const bdr   = isPos ? "#c4ddd6" : "#f0d0c4";
  return (
    <div style={{ background: bg, border: `1.5px solid ${bdr}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a9e98", marginBottom: 10 }}>
        Monthly Cashflow
      </div>
      {[
        { label: "Est. take-home income", val: netMonthly, sign: "+" },
        { label: "Monthly budget",        val: expenses,   sign: "−" },
        { label: "Planned savings",       val: savings,    sign: "−" },
      ].map(({ label, val, sign }, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: "#6b8f84" }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: sign === "+" ? "#3d6b5e" : "#4a6660" }}>
            {sign} {currency(val)}
          </span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${bdr}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#2d3a35" }}>
          {isPos ? "Monthly surplus" : "Monthly shortfall"}
        </span>
        <span style={{ fontFamily: "Instrument Serif, serif", fontSize: 22, color }}>
          {isPos ? "" : "−"}{currency(Math.abs(surplus))}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#b0bab6", marginTop: 6 }}>
        ★ Income estimate based on FY2026-27 marginal rates. Salary sacrifice deducted where entered.
      </div>
    </div>
  );
}

// ─── CASHFLOW CALENDAR COMPONENT ─────────────────────────────────────────────

export function CashflowCalendar({ items, netMonthly, startingCash = 0, compact = false }) {
  const rows      = buildCashflowCalendar(items || [], netMonthly, startingCash);
  const hasSpikes = (items || []).some(i => (i.frequency === "annual" || i.frequency === "quarterly") && i.month);
  const hasNonMonthly = (items || []).some(i => i.frequency === "annual" || i.frequency === "quarterly");

  // ── COMPACT: 12-chip row shown in Stage 2 ──────────────────────────────────
  if (compact) {
    if (!hasNonMonthly) return null;
    if (!hasSpikes) {
      return (
        <div style={{
          background: "#f9faf9", border: "1.5px dashed #c4ddd6", borderRadius: 10,
          padding: "12px 16px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>📅</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#2d3a35", marginBottom: 2 }}>Unlock cashflow calendar</div>
            <div style={{ fontSize: 11, color: "#8a9e98" }}>
              Set <strong style={{ color: "#3d6b5e" }}>Yr</strong> or <strong style={{ color: "#3d6b5e" }}>Qtr</strong> on any expense and pick a month — see exactly which months run tight.
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ background: "#f9faf9", border: "1.5px solid #e2eae6", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#8a9e98", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Month-by-month cashflow preview
        </div>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 2 }}>
          {rows.map(row => {
            const isPos   = row.net >= 0;
            const isTight = isPos && netMonthly > 0 && row.net < netMonthly * 0.3;
            return (
              <div key={row.short} style={{
                flex: "0 0 48px", padding: "6px 4px", borderRadius: 8, textAlign: "center",
                background: isPos ? (isTight ? "#fffbf0" : "#eaf2ef") : "#fdf4f0",
                border: `1px solid ${isPos ? (isTight ? "#e4d8bc" : "#c4ddd6") : "#f0d0c4"}`,
              }}>
                <div style={{ fontSize: 9, color: "#8a9e98", marginBottom: 3, fontWeight: 500, letterSpacing: "0.03em" }}>{row.short}</div>
                <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, color: isPos ? (isTight ? "#7a6840" : "#3d6b5e") : "#9a3922" }}>
                  {isPos ? "+" : "−"}{currency(Math.abs(row.net)).replace("$", "")}
                </div>
                {row.annual > 0 && (
                  <div style={{ fontSize: 8, color: "#9a3922", marginTop: 2, lineHeight: 1 }} title={row.spikes.map(s => s.label).join(", ")}>●</div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: "#b0bab6", marginTop: 8 }}>
          ● = lump-sum due this month · amber = tight (under 30% of normal surplus) · full calendar in Analysis
        </div>
      </div>
    );
  }

  // ── FULL TABLE: shown in Stage 7 Analysis ─────────────────────────────────
  const minCash = startingCash > 0 ? Math.min(...rows.map(r => r.cumulative)) : null;
  const thStyle = { fontSize: 11, fontWeight: 600, color: "#8a9e98", padding: "7px 10px", textAlign: "right", background: "#f4f7f5", borderBottom: "1.5px solid #e2eae6" };

  return (
    <div style={{ background: "white", border: "1.5px solid #e2eae6", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e2eae6" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#8a9e98", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          12-Month Cashflow Calendar
        </div>
        {startingCash > 0 && (
          <div style={{ fontSize: 11, color: "#6b8f84" }}>Starting cash: {currency(startingCash)}</div>
        )}
      </div>

      {!hasNonMonthly ? (
        <div style={{ padding: "20px 16px", fontSize: 12, color: "#8a9e98", textAlign: "center" }}>
          Add annual or quarterly expenses in Stage 2 and assign a start month to see the calendar.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left", paddingLeft: 16 }}>Month</th>
                <th style={thStyle}>Income</th>
                <th style={thStyle}>Fixed</th>
                <th style={thStyle}>Annual due</th>
                <th style={thStyle}>Net</th>
                {startingCash > 0 && <th style={thStyle}>Cash balance</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isNeg    = row.net < 0;
                const isTight  = !isNeg && netMonthly > 0 && row.net < netMonthly * 0.3;
                const rowBg    = isNeg ? "#fdf4f0" : isTight ? "#fffdf5" : idx % 2 === 0 ? "white" : "#fafcfa";
                const isLowest = minCash !== null && row.cumulative === minCash;
                const tdBase   = { padding: "8px 10px", borderBottom: "1px solid #f0f4f2", fontSize: 12 };
                return (
                  <tr key={row.name} style={{ background: rowBg }}>
                    <td style={{ ...tdBase, paddingLeft: 16, color: "#2d3a35", fontWeight: isNeg || isTight ? 600 : 400 }}>
                      {row.name}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", color: "#3d6b5e" }}>
                      {currency(row.income)}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", color: "#6b7a74" }}>
                      ({currency(row.fixed)})
                    </td>
                    <td style={{ ...tdBase, textAlign: "right" }}>
                      {row.annual > 0 ? (
                        <div>
                          <div style={{ color: "#9a3922", fontWeight: 600 }}>({currency(row.annual)})</div>
                          <div style={{ fontSize: 10, color: "#a08060", marginTop: 1 }}>
                            {row.spikes.map(s => s.label).join(", ")}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#d0d8d4" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdBase, textAlign: "right", fontWeight: 600, color: isNeg ? "#9a3922" : isTight ? "#7a6840" : "#3d6b5e" }}>
                      {isNeg ? "−" : "+"}{currency(Math.abs(row.net))}
                    </td>
                    {startingCash > 0 && (
                      <td style={{ ...tdBase, textAlign: "right", color: row.cumulative < 0 ? "#9a3922" : "#2d3a35", fontWeight: isLowest ? 700 : 400 }}>
                        {currency(row.cumulative)}
                        {isLowest && <span style={{ fontSize: 9, color: "#9a3922", marginLeft: 4 }}>▼ low</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f4f7f5" }}>
                <td style={{ fontSize: 11, fontWeight: 600, color: "#6b8f84", padding: "8px 16px", borderTop: "1.5px solid #e2eae6" }}>Full year</td>
                <td style={{ fontSize: 11, color: "#3d6b5e", padding: "8px 10px", textAlign: "right", borderTop: "1.5px solid #e2eae6" }}>{currency(netMonthly * 12)}</td>
                <td style={{ fontSize: 11, color: "#6b7a74", padding: "8px 10px", textAlign: "right", borderTop: "1.5px solid #e2eae6" }}>
                  ({currency((rows[0]?.fixed || 0) * 12)})
                </td>
                <td style={{ fontSize: 11, color: "#9a3922", padding: "8px 10px", textAlign: "right", borderTop: "1.5px solid #e2eae6" }}>
                  {rows.some(r => r.annual > 0) ? `(${currency(rows.reduce((s, r) => s + r.annual, 0))})` : "—"}
                </td>
                <td
                  colSpan={startingCash > 0 ? 2 : 1}
                  style={{ fontSize: 11, fontWeight: 700, padding: "8px 10px", textAlign: "right", borderTop: "1.5px solid #e2eae6", color: rows.reduce((s, r) => s + r.net, 0) >= 0 ? "#3d6b5e" : "#9a3922" }}
                >
                  {currency(rows.reduce((s, r) => s + r.net, 0))} annual
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div style={{ fontSize: 10, color: "#b0bab6", padding: "8px 16px", borderTop: "1px solid #f0f4f2" }}>
        ★ Annual expenses without a month assigned are smoothed into Fixed spend. Income estimated from FY2026-27 marginal rates.
      </div>
    </div>
  );
}

// ─── BUDGET ITEM ROW ─────────────────────────────────────────────────────────

// Frequency cycle order for BudgetItem toggle
const FREQ_CYCLE = { monthly: "quarterly", quarterly: "annual", annual: "monthly" };
const FREQ_LABEL = { monthly: "Mo", quarterly: "Qtr", annual: "Yr" };

function BudgetItem({ item, onUpdate, onRemove }) {
  const monthly      = itemMonthly(item);
  const freq         = item.frequency || "monthly";
  const isNonMonthly = freq !== "monthly";
  const nextFreq     = FREQ_CYCLE[freq] || "monthly";

  const removeBtn = (
    <button
      onClick={() => onRemove(item.id)}
      style={{
        flexShrink: 0, width: 22, height: 22, border: "none",
        background: "none", color: "#c8d0cc", cursor: "pointer",
        fontSize: 17, lineHeight: "22px", textAlign: "center",
        borderRadius: 4, padding: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.color = "#9a3922"}
      onMouseLeave={e => e.currentTarget.style.color = "#c8d0cc"}
    >×</button>
  );

  const freqBtn = (
    <button
      onClick={() => onUpdate(item.id, { frequency: nextFreq, month: nextFreq === "monthly" ? null : item.month })}
      title={`Frequency: ${freq} — click to cycle Mo → Qtr → Yr`}
      style={{
        flexShrink: 0, padding: "6px 9px", border: "1.5px solid",
        borderColor: isNonMonthly ? "#3d6b5e" : "#d4ddd9", borderRadius: 7,
        fontSize: 11, fontWeight: 600,
        color: isNonMonthly ? "#3d6b5e" : "#a0aba6",
        background: isNonMonthly ? "#eaf2ef" : "#f9faf9",
        cursor: "pointer", fontFamily: "inherit",
      }}
    >{FREQ_LABEL[freq]}</button>
  );

  // ── Non-monthly (Qtr / Yr): two-row layout so label always has full width ──
  if (isNonMonthly) {
    return (
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #f0f4f2", background: "white" }}>
        {/* Row 1: label + /mo equivalent + remove */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, fontSize: 13, color: "#2d3a35", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </div>
          {monthly > 0 && (
            <div style={{ fontSize: 10, color: "#b0bab6", whiteSpace: "nowrap", flexShrink: 0 }}>
              {currency(monthly)}/mo
            </div>
          )}
          {removeBtn}
        </div>
        {/* Row 2: amount + cycle button + month select */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <Input value={item.amount} onChange={v => onUpdate(item.id, { amount: v })} placeholder="0" prefix="$" />
          </div>
          {freqBtn}
          <select
            value={item.month || ""}
            onChange={e => onUpdate(item.id, { month: e.target.value ? parseInt(e.target.value) : null })}
            title={freq === "quarterly" ? "First payment month (repeats every 3 months)" : "Month this falls due"}
            style={{
              flexShrink: 0, padding: "6px 5px", width: 54,
              border: `1.5px solid ${item.month ? "#3d6b5e" : "#d4ddd9"}`,
              borderRadius: 7, fontSize: 12,
              color: item.month ? "#3d6b5e" : "#a0aba6",
              background: item.month ? "#eaf2ef" : "#f9faf9",
              outline: "none", fontFamily: "inherit", cursor: "pointer",
              appearance: "none", textAlign: "center",
            }}
          >
            <option value="">{freq === "quarterly" ? "Start" : "Mo?"}</option>
            {MONTH_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
    );
  }

  // ── Monthly: compact single-row layout ────────────────────────────────────
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 14px", borderBottom: "1px solid #f0f4f2", background: "white",
    }}>
      <div style={{ flex: 1, fontSize: 13, color: "#2d3a35", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </div>
      <div style={{ width: 100, flexShrink: 0 }}>
        <Input value={item.amount} onChange={v => onUpdate(item.id, { amount: v })} placeholder="0" prefix="$" />
      </div>
      {freqBtn}
      {removeBtn}
    </div>
  );
}

// ─── ADD ITEM PICKER (multi-select: tap chips, fill amounts, add all at once) ──

function AddItemPicker({ categoryKey, catLabel, onAdd, onCancel }) {
  const [queue,  setQueue]  = useState([]); // [{id, label, amount, frequency, month}]
  const [custom, setCustom] = useState("");
  const customRef = useRef(null);
  const isMobile  = typeof window !== "undefined" && window.innerWidth < 640;
  const suggestions    = BUDGET_SUGGESTIONS[categoryKey] || [];
  const selectedLabels = new Set(queue.map(q => q.label));

  // Desktop: focus custom input on open
  useEffect(() => {
    if (!isMobile) {
      const t = setTimeout(() => customRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isMobile]);

  // Lock body scroll on mobile while sheet is open
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  function toggleChip(label) {
    if (selectedLabels.has(label)) {
      setQueue(q => q.filter(i => i.label !== label));
    } else {
      setQueue(q => [...q, {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        label, amount: "", frequency: "monthly", month: null,
      }]);
    }
  }

  function addCustom() {
    const label = custom.trim();
    if (!label || selectedLabels.has(label)) return;
    setQueue(q => [...q, {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      label, amount: "", frequency: "monthly", month: null,
    }]);
    setCustom("");
  }

  function updateQueueItem(id, changes) {
    setQueue(q => q.map(i => i.id === id ? { ...i, ...changes } : i));
  }

  function removeQueueItem(id) {
    setQueue(q => q.filter(i => i.id !== id));
  }

  function commit() {
    if (queue.length === 0) return;
    onAdd(queue.map(({ label, amount, frequency, month }) => ({
      label, amount, frequency, month: frequency !== "monthly" ? month : null,
    })));
  }

  // ── Shared content ─────────────────────────────────────────────────────────

  const chipGrid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {suggestions.map(s => {
        const sel = selectedLabels.has(s);
        return (
          <button key={s} onClick={() => toggleChip(s)} style={{
            padding: "9px 14px", border: "1.5px solid",
            borderColor: sel ? "#3d6b5e" : "#c4ddd6", borderRadius: 20,
            fontSize: 13, color: sel ? "white" : "#3d6b5e",
            background: sel ? "#3d6b5e" : "white",
            minHeight: 40, cursor: "pointer", fontFamily: "inherit",
            lineHeight: 1.4, display: "flex", alignItems: "center", gap: 5,
          }}>
            {sel && <span style={{ fontSize: 11, lineHeight: 1 }}>✓</span>}
            {s}
          </button>
        );
      })}
    </div>
  );

  const customRow = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
      <input
        ref={customRef}
        value={custom}
        onChange={e => setCustom(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && custom.trim()) addCustom(); }}
        placeholder="Custom item name…"
        style={{
          flex: 1, padding: "11px 14px", border: "1.5px solid #d4ddd9",
          borderRadius: 10, fontSize: 16, color: "#0f1a16", background: "white",
          outline: "none", fontFamily: "inherit",
        }}
        onFocus={e => e.target.style.borderColor = "#3d6b5e"}
        onBlur={e => e.target.style.borderColor = "#d4ddd9"}
      />
      {custom.trim() && (
        <button onClick={addCustom} style={{
          padding: "11px 16px", border: "none", borderRadius: 10,
          background: "#3d6b5e", color: "white", fontSize: 14,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}>+ Add</button>
      )}
    </div>
  );

  const queueSection = queue.length > 0 && (
    <div>
      {/* Divider with count */}
      <div style={{
        fontSize: 10, fontWeight: 600, color: "#8a9e98", textTransform: "uppercase",
        letterSpacing: "0.08em", margin: "4px 0 12px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ flex: 1, height: 1, background: "#e2eae6" }} />
        Selected {queue.length}
        <div style={{ flex: 1, height: 1, background: "#e2eae6" }} />
      </div>

      {queue.map(item => (
        <div key={item.id} style={{
          background: "#f4f7f5", border: "1px solid #e2eae6",
          borderRadius: 10, padding: "10px 12px", marginBottom: 8,
        }}>
          {/* Label + remove */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#0f1a16", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </div>
            <button
              onClick={() => removeQueueItem(item.id)}
              style={{ border: "none", background: "none", color: "#c8d0cc", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 0 0 8px", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "#9a3922"}
              onMouseLeave={e => e.currentTarget.style.color = "#c8d0cc"}
            >×</button>
          </div>
          {/* Amount + Mo/Yr + month select */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Amount input */}
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#6b8f84", pointerEvents: "none" }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                value={item.amount}
                onChange={e => updateQueueItem(item.id, { amount: e.target.value })}
                placeholder="0"
                style={{
                  width: "100%", padding: "9px 10px 9px 24px",
                  border: "1.5px solid #d4ddd9", borderRadius: 8,
                  fontSize: 16, color: "#0f1a16", background: "white",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "#3d6b5e"}
                onBlur={e => e.target.style.borderColor = "#d4ddd9"}
              />
            </div>
            {/* Mo / Qtr / Yr */}
            {[{ val: "monthly", short: "Mo" }, { val: "quarterly", short: "Qtr" }, { val: "annual", short: "Yr" }].map(({ val, short }) => (
              <button key={val} onClick={() => updateQueueItem(item.id, { frequency: val, month: val === "monthly" ? null : item.month })} style={{
                padding: "9px 8px", border: "1.5px solid",
                borderColor: item.frequency === val ? "#3d6b5e" : "#d4ddd9",
                borderRadius: 8, fontSize: 12, fontWeight: item.frequency === val ? 600 : 400,
                color: item.frequency === val ? "#3d6b5e" : "#a0aba6",
                background: item.frequency === val ? "#eaf2ef" : "white",
                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}>{short}</button>
            ))}
            {/* Month select — for annual (exact month) or quarterly (start month, repeats ×4) */}
            {item.frequency !== "monthly" && (
              <select
                value={item.month || ""}
                onChange={e => updateQueueItem(item.id, { month: e.target.value ? parseInt(e.target.value) : null })}
                style={{
                  flexShrink: 0, padding: "9px 6px", width: 58,
                  border: `1.5px solid ${item.month ? "#3d6b5e" : "#d4ddd9"}`,
                  borderRadius: 8, fontSize: 12,
                  color: item.month ? "#3d6b5e" : "#a0aba6",
                  background: item.month ? "#eaf2ef" : "white",
                  outline: "none", fontFamily: "inherit", cursor: "pointer",
                  appearance: "none", textAlign: "center",
                }}
              >
                <option value="">Mo?</option>
                {MONTH_SHORT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const addBtn = (
    <button
      onClick={commit}
      disabled={queue.length === 0}
      style={{
        width: "100%", padding: "14px", border: "none", borderRadius: 12,
        background: queue.length > 0 ? "#3d6b5e" : "#c8d0cc",
        color: "white", fontSize: 15, fontWeight: 600,
        cursor: queue.length > 0 ? "pointer" : "default", fontFamily: "inherit",
      }}
    >
      {queue.length === 0
        ? "Select items above"
        : `Add ${queue.length} item${queue.length !== 1 ? "s" : ""} to ${catLabel}`}
    </button>
  );

  const bodyContent = <>{chipGrid}{customRow}{queueSection}</>;

  // ── MOBILE: bottom sheet ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 }}>
        <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "rgba(15,26,22,0.5)" }} />
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          background: "white", borderRadius: "20px 20px 0 0",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.15)",
        }}>
          {/* Handle */}
          <div style={{ padding: "12px 0 0", display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#d4ddd9" }} />
          </div>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px 4px", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f1a16" }}>Add to {catLabel}</div>
            <button onClick={onCancel} style={{
              background: "#f4f7f5", border: "none", borderRadius: 20,
              width: 32, height: 32, fontSize: 18, color: "#6b8f84",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>
          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px 0" }}>
            {bodyContent}
          </div>
          {/* Sticky footer */}
          <div style={{ padding: "14px 20px 32px", borderTop: "1px solid #f0f4f2", background: "white", flexShrink: 0 }}>
            {addBtn}
          </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP: inline ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "14px", background: "#edf2f0", borderTop: "2px solid #c4ddd6" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#6b8f84", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
        Select one or more items
      </div>
      {bodyContent}
      {addBtn}
      <button onClick={onCancel} style={{
        marginTop: 8, width: "100%", padding: "9px", border: "1.5px solid #d4ddd9",
        borderRadius: 10, background: "white", color: "#8a9e98",
        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      }}>Cancel</button>
    </div>
  );
}

// ─── BUDGET CATEGORY ─────────────────────────────────────────────────────────

function BudgetCategory({ cat, items, onAddItems, onUpdateItem, onRemoveItem }) {
  const catTotal      = items.reduce((s, item) => s + itemMonthly(item), 0);
  const hasNonMonthly = items.some(i => i.frequency === "annual" || i.frequency === "quarterly");
  const [expanded,   setExpanded]   = useState(items.length > 0);
  const [showPicker, setShowPicker] = useState(false);

  function handleAdd(itemsToAdd) {
    // itemsToAdd: [{label, amount, frequency, month}]
    onAddItems(cat.key, itemsToAdd);
    setShowPicker(false);
  }

  return (
    <div style={{ borderBottom: "1px solid #eaeeed" }}>
      <div
        onClick={() => { setExpanded(e => !e); setShowPicker(false); }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          background: catTotal > 0 ? "white" : "transparent",
        }}
      >
        <span style={{ fontSize: 15, width: 22, textAlign: "center", flexShrink: 0 }}>{cat.icon}</span>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#2d3a35" }}>{cat.label}</div>
        {catTotal > 0 ? (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontFamily: "Instrument Serif, serif", color: "#0f1a16" }}>
              {currency(catTotal)}<span style={{ fontSize: 10, color: "#b0bab6", fontFamily: "DM Sans, sans-serif" }}>/mo</span>
            </div>
            {hasNonMonthly && (
              <div style={{ fontSize: 9, color: "#c0c8c4" }}>{currency(catTotal * 12)}/yr</div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#d0d8d4" }}>—</div>
        )}
        <span style={{ color: "#b0bab6", fontSize: 10, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div>
          {items.map(item => (
            <BudgetItem key={item.id} item={item} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
          ))}
          {showPicker ? (
            <AddItemPicker categoryKey={cat.key} catLabel={cat.label} onAdd={handleAdd} onCancel={() => setShowPicker(false)} />
          ) : (
            <div style={{ padding: "8px 14px", background: "#fafcfa" }}>
              <button
                onClick={e => { e.stopPropagation(); setShowPicker(true); }}
                style={{
                  padding: "5px 12px", border: "1.5px dashed #c4ddd6", borderRadius: 8,
                  background: "none", color: "#3d6b5e", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >+ Add item</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STAGE 2 ──────────────────────────────────────────────────────────────────

export default function Stage2({ data, setMany }) {
  const items  = data.budgetItems || [];
  const n      = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const bTotal = budgetTotal(items);

  function addItems(categoryKey, newItemsList) {
    // newItemsList: [{label, amount, frequency, month}]
    const toAdd = newItemsList.map(({ label, amount, frequency, month }) =>
      newItem(categoryKey, label, amount, frequency, month)
    );
    const updated = [...items, ...toAdd];
    setMany({ budgetItems: updated, monthlyExpenses: String(Math.round(budgetTotal(updated))) });
  }

  function updateItem(id, changes) {
    const updated = items.map(item => item.id === id ? { ...item, ...changes } : item);
    const total   = budgetTotal(updated);
    setMany({ budgetItems: updated, monthlyExpenses: String(Math.round(total)) });
  }

  function removeItem(id) {
    const updated = items.filter(item => item.id !== id);
    const total   = budgetTotal(updated);
    setMany({ budgetItems: updated, monthlyExpenses: String(Math.round(total)) });
  }

  const netMonthly = estimateNetMonthly(data);
  const expenses   = bTotal > 0 ? bTotal : n(data.monthlyExpenses);
  const savings    = n(data.savingsPerMonth);
  const surplus    = netMonthly - expenses - savings;

  return (
    <div>
      <TwoCol>
        <Field label="Your gross annual income" hint="Before tax">
          <Input value={data.grossIncome} onChange={v => setMany({ grossIncome: v })} placeholder="95,000" prefix="$" />
        </Field>
        {data.hasPartner === "yes" ? (
          <Field label="Partner's gross income" hint="Before tax">
            <Input value={data.partnerIncome} onChange={v => setMany({ partnerIncome: v })} placeholder="80,000" prefix="$" />
          </Field>
        ) : <div />}
      </TwoCol>
      <TwoCol>
        <Field label="Annual bonus / incentives" hint="Leave blank if none">
          <Input value={data.bonusIncome} onChange={v => setMany({ bonusIncome: v })} placeholder="0" prefix="$" />
        </Field>
        <Field label="Other income" hint="Rental, side income, dividends">
          <Input value={data.otherIncome} onChange={v => setMany({ otherIncome: v })} placeholder="0" prefix="$" />
        </Field>
      </TwoCol>

      <SectionDivider label="Monthly Budget" />

      <div style={{ background: "#f9faf9", border: "1.5px solid #e2eae6", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        {BUDGET_CATS.map(cat => (
          <BudgetCategory
            key={cat.key}
            cat={cat}
            items={items.filter(i => i.categoryKey === cat.key)}
            onAddItems={addItems}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
          />
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#eaf2ef", borderTop: "1.5px solid #c4ddd6" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#3d6b5e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Monthly total · {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "Instrument Serif, serif", fontSize: 22, color: "#0f1a16" }}>
              {bTotal > 0 ? currency(bTotal) : <span style={{ color: "#c0c8c4", fontSize: 15 }}>Add items above</span>}
            </div>
            {bTotal > 0 && (
              <div style={{ fontSize: 10, color: "#8a9e98" }}>{currency(bTotal * 12)}/year</div>
            )}
          </div>
        </div>
      </div>

      {netMonthly > 0 && (bTotal > 0 || expenses > 0) && (
        <CashflowSummary netMonthly={netMonthly} expenses={expenses} savings={savings} surplus={surplus} />
      )}

      {/* Compact cashflow calendar preview — prompts month-setting or shows chip row */}
      {netMonthly > 0 && items.length > 0 && (
        <CashflowCalendar items={items} netMonthly={netMonthly} compact />
      )}

      <SectionDivider label="Other spending" />
      <TwoCol>
        <Field label="Annual irregular expenses" hint="Holidays, car rego, rates, gifts">
          <Input value={data.annualIrregular} onChange={v => setMany({ annualIrregular: v })} placeholder="5,000" prefix="$" />
        </Field>
        <Field label="Monthly savings target" hint="Net amount you put aside each month">
          <Input value={data.savingsPerMonth} onChange={v => setMany({ savingsPerMonth: v })} placeholder="1,200" prefix="$" />
        </Field>
      </TwoCol>
    </div>
  );
}
