// ─── CLEARPATH — STAGE 2: INCOME & CASHFLOW (ITEM-LEVEL BUDGET) ──────────────

import { useState } from "react";
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

function annualTax(grossIncome) {
  const g = Math.max(0, parseFloat(String(grossIncome).replace(/,/g, "")) || 0);
  if (!g) return 0;
  let tax = 0;
  if (g > 18200)  tax += (Math.min(g, 45000)  - 18200)  * 0.19;
  if (g > 45000)  tax += (Math.min(g, 120000) - 45000)  * 0.325;
  if (g > 120000) tax += (Math.min(g, 180000) - 120000) * 0.37;
  if (g > 180000) tax += (g - 180000) * 0.45;
  if (g > 23365)  tax += g * 0.02;
  if (g <= 37500)      tax -= 700;
  else if (g <= 45000) tax -= (700 - (g - 37500) * 0.05);
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
  return item?.frequency === "annual" ? amount / 12 : amount;
}

export function budgetTotal(items) {
  return (items || []).reduce((sum, item) => sum + itemMonthly(item), 0);
}

// ─── CASHFLOW CALENDAR LOGIC ──────────────────────────────────────────────────

// Builds 12 monthly rows from budget items + income.
// Annual items WITH a month set appear as a one-off spike in that month.
// Annual items WITHOUT a month are smoothed into fixedMonthly (÷12).
export function buildCashflowCalendar(items, netMonthlyIncome, startingCash = 0) {
  const p = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const monthlyItems    = (items || []).filter(i => i.frequency === "monthly");
  const annualWithMonth = (items || []).filter(i => i.frequency === "annual" && i.month);
  const annualNoMonth   = (items || []).filter(i => i.frequency === "annual" && !i.month);

  const fixedMonthly =
    monthlyItems.reduce((s, i) => s + p(i.amount), 0) +
    annualNoMonth.reduce((s, i) => s + p(i.amount) / 12, 0);

  let cumulative = startingCash;
  return MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    const spikes   = annualWithMonth.filter(i => parseInt(i.month) === monthNum);
    const annualDue = spikes.reduce((s, i) => s + p(i.amount), 0);
    const net = netMonthlyIncome - fixedMonthly - annualDue;
    cumulative += net;
    return { name, short: MONTH_SHORT[idx], income: netMonthlyIncome, fixed: fixedMonthly, annual: annualDue, spikes, net, cumulative };
  });
}

function newItem(categoryKey, label) {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    categoryKey, label, amount: "", frequency: "monthly", month: null,
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
        ★ Income estimate based on FY2025-26 marginal rates. Salary sacrifice deducted where entered.
      </div>
    </div>
  );
}

// ─── CASHFLOW CALENDAR COMPONENT ─────────────────────────────────────────────

export function CashflowCalendar({ items, netMonthly, startingCash = 0, compact = false }) {
  const rows     = buildCashflowCalendar(items || [], netMonthly, startingCash);
  const hasSpikes = (items || []).some(i => i.frequency === "annual" && i.month);
  const hasAnnual = (items || []).some(i => i.frequency === "annual");

  // ── COMPACT: 12-chip row shown in Stage 2 ──────────────────────────────────
  if (compact) {
    if (!hasAnnual) return null;
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
              Tap <strong style={{ color: "#3d6b5e" }}>Yr</strong> on any annual expense, then pick which month it falls due — instantly see which months are tight.
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

      {!hasAnnual ? (
        <div style={{ padding: "20px 16px", fontSize: 12, color: "#8a9e98", textAlign: "center" }}>
          Add annual expenses in Stage 2 and assign a month to each to see the calendar.
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
        ★ Annual expenses without a month assigned are smoothed into Fixed spend. Income estimated from FY2025-26 marginal rates.
      </div>
    </div>
  );
}

// ─── BUDGET ITEM ROW ─────────────────────────────────────────────────────────

function BudgetItem({ item, onUpdate, onRemove }) {
  const monthly  = itemMonthly(item);
  const isAnnual = item.frequency === "annual";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 14px", borderBottom: "1px solid #f0f4f2",
      background: "white",
    }}>
      <div style={{ flex: 1, fontSize: 13, color: "#2d3a35", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </div>
      {isAnnual && monthly > 0 && (
        <div style={{ fontSize: 10, color: "#b0bab6", whiteSpace: "nowrap", flexShrink: 0 }}>
          {currency(monthly)}/mo
        </div>
      )}
      <div style={{ width: 100, flexShrink: 0 }}>
        <Input value={item.amount} onChange={v => onUpdate(item.id, { amount: v })} placeholder="0" prefix="$" />
      </div>
      {/* Mo / Yr toggle */}
      <button
        onClick={() => isAnnual
          ? onUpdate(item.id, { frequency: "monthly", month: null })
          : onUpdate(item.id, { frequency: "annual" })
        }
        title={isAnnual ? "Switch to monthly" : "Switch to annual"}
        style={{
          flexShrink: 0, padding: "4px 9px", border: "1.5px solid",
          borderColor: isAnnual ? "#3d6b5e" : "#d4ddd9", borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          color: isAnnual ? "#3d6b5e" : "#a0aba6",
          background: isAnnual ? "#eaf2ef" : "#f9faf9",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >{isAnnual ? "Yr" : "Mo"}</button>
      {/* Month picker — only for annual items */}
      {isAnnual && (
        <select
          value={item.month || ""}
          onChange={e => onUpdate(item.id, { month: e.target.value ? parseInt(e.target.value) : null })}
          title="Which month does this fall due?"
          style={{
            flexShrink: 0, padding: "4px 5px", width: 52,
            border: `1.5px solid ${item.month ? "#3d6b5e" : "#d4ddd9"}`,
            borderRadius: 6, fontSize: 11,
            color: item.month ? "#3d6b5e" : "#a0aba6",
            background: item.month ? "#eaf2ef" : "#f9faf9",
            outline: "none", fontFamily: "inherit", cursor: "pointer",
            appearance: "none", textAlign: "center",
          }}
        >
          <option value="">Mo?</option>
          {MONTH_SHORT.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      )}
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
    </div>
  );
}

// ─── ADD ITEM PICKER ─────────────────────────────────────────────────────────

function AddItemPicker({ categoryKey, onAdd, onCancel }) {
  const [custom, setCustom] = useState("");
  const suggestions = BUDGET_SUGGESTIONS[categoryKey] || [];

  function handleAdd(label) {
    if (label.trim()) onAdd(label.trim());
  }

  return (
    <div style={{ padding: "12px 14px", background: "#f4f7f5", borderTop: "1px solid #e2eae6" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#8a9e98", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Select or type an item
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => handleAdd(s)}
            style={{
              padding: "5px 11px", border: "1.5px solid #c4ddd6", borderRadius: 20,
              background: "white", fontSize: 12, color: "#3d6b5e",
              cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#eaf2ef"; e.currentTarget.style.borderColor = "#3d6b5e"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#c4ddd6"; }}
          >{s}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && custom.trim()) handleAdd(custom); }}
          placeholder="Custom item name…"
          autoFocus
          style={{
            flex: 1, padding: "8px 12px", border: "1.5px solid #d4ddd9",
            borderRadius: 8, fontSize: 13, color: "#0f1a16", background: "white",
            outline: "none", fontFamily: "inherit",
          }}
          onFocus={e => e.target.style.borderColor = "#3d6b5e"}
          onBlur={e => e.target.style.borderColor = "#d4ddd9"}
        />
        {custom.trim() && (
          <button
            onClick={() => handleAdd(custom)}
            style={{
              padding: "8px 14px", border: "none", borderRadius: 8,
              background: "#3d6b5e", color: "white", fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >Add</button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: "8px 12px", border: "1.5px solid #d4ddd9", borderRadius: 8,
            background: "white", color: "#8a9e98", fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >Cancel</button>
      </div>
    </div>
  );
}

// ─── BUDGET CATEGORY ─────────────────────────────────────────────────────────

function BudgetCategory({ cat, items, onAddItem, onUpdateItem, onRemoveItem }) {
  const catTotal  = items.reduce((s, item) => s + itemMonthly(item), 0);
  const hasAnnual = items.some(i => i.frequency === "annual");
  const [expanded,   setExpanded]   = useState(items.length > 0);
  const [showPicker, setShowPicker] = useState(false);

  function handleAdd(label) {
    onAddItem(cat.key, label);
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
            {hasAnnual && (
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
            <AddItemPicker categoryKey={cat.key} onAdd={handleAdd} onCancel={() => setShowPicker(false)} />
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

  function addItem(categoryKey, label) {
    setMany({ budgetItems: [...items, newItem(categoryKey, label)] });
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
            onAddItem={addItem}
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
