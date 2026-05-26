// ─── CLEARPATH — STAGE 3: ASSETS & SAVINGS (ITEM-LEVEL) ──────────────────────

import { useState } from "react";
import { currency, Field, Input, SectionDivider } from "./ui.jsx";

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

export const ASSET_CATS = [
  { key: "cash",   label: "Cash & bank accounts", icon: "🏦" },
  { key: "shares", label: "Shares & ETFs",         icon: "📈" },
  { key: "funds",  label: "Managed funds",         icon: "📊" },
  { key: "crypto", label: "Cryptocurrency",        icon: "₿"  },
  { key: "other",  label: "Other investments",     icon: "🏢" },
];

const ASSET_SUGGESTIONS = {
  cash: [
    "Savings account", "Transaction account", "Offset account (PPOR)",
    "High-interest savings (ING, Macquarie etc.)", "Term deposit",
    "Cash management account", "Foreign currency account",
  ],
  shares: [
    "VAS – Vanguard Australia Shares ETF", "VGS – Vanguard International Shares ETF",
    "A200 – Betashares Australia 200 ETF", "IVV – iShares S&P 500 ETF",
    "NDQ – Betashares Nasdaq 100 ETF",    "BGBL – Betashares Global Shares ETF",
    "VHY – Vanguard High Yield ETF",      "QOZ – Betashares Australia Quality ETF",
    "AFI – Australian Foundation Investment", "MLT – Milton Corporation",
    "ASX individual shares", "US shares / ADRs",
  ],
  funds: [
    "Vanguard Diversified Growth Fund", "Vanguard LifeStrategy Growth",
    "Australian Ethical Balanced", "Pendal Active Fund",
    "Aware Super Choice Income Stream", "Managed discretionary account (MDA)",
  ],
  crypto: [
    "Bitcoin (BTC)", "Ethereum (ETH)", "Solana (SOL)", "Other crypto",
  ],
  other: [
    "Business interest / equity", "Private company shares",
    "Private loan (money owed to you)", "Unlisted property trust",
    "Agriculture / farmland", "Art & collectibles",
  ],
};

// ─── DERIVE FLAT FIELDS FOR ENGINE ───────────────────────────────────────────
// Engine.js reads flat fields (cashSavings, sharesEtfs, etc.).
// This aggregator converts the items array back to those flat fields
// so the engine requires zero changes.

export function deriveAssetTotals(assetItems = []) {
  const p = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const sumCat = key => (assetItems || [])
    .filter(i => i.categoryKey === key)
    .reduce((s, i) => s + p(i.amount), 0);
  return {
    cashSavings:     sumCat("cash"),
    offsetBalance:   0,            // captured in cashSavings (cash category)
    sharesEtfs:      sumCat("shares"),
    managedFunds:    sumCat("funds"),
    crypto:          sumCat("crypto"),
    otherInvestments: sumCat("other"),
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function newAssetItem(categoryKey, label) {
  return {
    id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    categoryKey, label, amount: "",
  };
}

// ─── ASSET ITEM ROW ───────────────────────────────────────────────────────────

function AssetItem({ item, onUpdate, onRemove }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 14px", borderBottom: "1px solid #f0f4f2",
      background: "white",
    }}>
      <div style={{ flex: 1, fontSize: 13, color: "#2d3a35", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </div>
      <div style={{ width: 120, flexShrink: 0 }}>
        <Input
          value={item.amount}
          onChange={v => onUpdate(item.id, { amount: v })}
          placeholder="0"
          prefix="$"
        />
      </div>
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

// ─── ADD ASSET PICKER ─────────────────────────────────────────────────────────

function AddAssetPicker({ categoryKey, onAdd, onCancel }) {
  const [custom, setCustom] = useState("");
  const suggestions = ASSET_SUGGESTIONS[categoryKey] || [];

  function handleAdd(label) {
    if (label.trim()) onAdd(label.trim());
  }

  return (
    <div style={{ padding: "12px 14px", background: "#f4f7f5", borderTop: "1px solid #e2eae6" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#8a9e98", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        Select or type an asset
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
          placeholder="Custom asset name…"
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

// ─── ASSET CATEGORY ───────────────────────────────────────────────────────────

function AssetCategory({ cat, items, onAddItem, onUpdateItem, onRemoveItem }) {
  const p         = v => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const catTotal  = items.reduce((s, item) => s + p(item.amount), 0);
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
          <div style={{ fontSize: 13, fontFamily: "Instrument Serif, serif", color: "#0f1a16", flexShrink: 0 }}>
            {currency(catTotal)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#d0d8d4" }}>—</div>
        )}
        <span style={{ color: "#b0bab6", fontSize: 10, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div>
          {items.map(item => (
            <AssetItem key={item.id} item={item} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
          ))}
          {showPicker ? (
            <AddAssetPicker categoryKey={cat.key} onAdd={handleAdd} onCancel={() => setShowPicker(false)} />
          ) : (
            <div style={{ padding: "8px 14px", background: "#fafcfa" }}>
              <button
                onClick={e => { e.stopPropagation(); setShowPicker(true); }}
                style={{
                  padding: "5px 12px", border: "1.5px dashed #c4ddd6", borderRadius: 8,
                  background: "none", color: "#3d6b5e", fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >+ Add asset</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STAGE 3 ──────────────────────────────────────────────────────────────────

export default function AssetStage3({ data, setMany }) {
  const items  = data.assetItems || [];
  const totals = deriveAssetTotals(items);
  const totalLiquid = totals.cashSavings + totals.sharesEtfs + totals.managedFunds +
                      totals.crypto + totals.otherInvestments;

  function addItem(categoryKey, label) {
    setMany({ assetItems: [...items, newAssetItem(categoryKey, label)] });
  }

  function updateItem(id, changes) {
    setMany({ assetItems: items.map(item => item.id === id ? { ...item, ...changes } : item) });
  }

  function removeItem(id) {
    setMany({ assetItems: items.filter(item => item.id !== id) });
  }

  return (
    <div>
      <div style={{ background: "#f9faf9", border: "1.5px solid #e2eae6", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
        {ASSET_CATS.map(cat => (
          <AssetCategory
            key={cat.key}
            cat={cat}
            items={items.filter(i => i.categoryKey === cat.key)}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
          />
        ))}
        {/* Total row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#eaf2ef", borderTop: "1.5px solid #c4ddd6" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#3d6b5e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Total liquid · {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "Instrument Serif, serif", fontSize: 22, color: "#0f1a16" }}>
              {totalLiquid > 0 ? currency(totalLiquid) : <span style={{ color: "#c0c8c4", fontSize: 15 }}>Add assets above</span>}
            </div>
            {totalLiquid > 0 && (
              <div style={{ fontSize: 10, color: "#8a9e98" }}>excl. super & property</div>
            )}
          </div>
        </div>
      </div>

      {/* Category breakdown when there are items */}
      {totalLiquid > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {ASSET_CATS.map(cat => {
            const val = totals[cat.key === "cash" ? "cashSavings" : cat.key === "shares" ? "sharesEtfs" : cat.key === "funds" ? "managedFunds" : cat.key === "crypto" ? "crypto" : "otherInvestments"];
            if (!val) return null;
            const pct = Math.round((val / totalLiquid) * 100);
            return (
              <div key={cat.key} style={{
                flex: "1 1 auto", background: "#f4f7f5", border: "1px solid #e2eae6",
                borderRadius: 8, padding: "8px 12px",
              }}>
                <div style={{ fontSize: 10, color: "#8a9e98", marginBottom: 2 }}>{cat.icon} {cat.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0f1a16" }}>{currency(val)}</div>
                <div style={{ fontSize: 10, color: "#b0bab6" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      )}

      <SectionDivider label="Emergency position" />
      <Field label="Dedicated emergency fund" hint="Separate from everyday savings — 3–6 months of expenses recommended">
        <Input value={data.emergencyFund} onChange={v => setMany({ emergencyFund: v })} placeholder="10,000" prefix="$" />
      </Field>
    </div>
  );
}
