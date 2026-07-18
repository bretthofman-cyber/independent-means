// ─── CLEARPATH SHARED UI PRIMITIVES ──────────────────────────────────────────
// Imported by App.jsx and any stage component files.

import { useState } from "react";

export function currency(val) {
  const n = parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(n)) return "—";
  return "$" + n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
}

export function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 15, fontWeight: 500, color: "#2d3a35", marginBottom: hint ? 2 : 6 }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 12, color: "#8a9e98", marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function fmtAmount(v) {
  const raw = String(v || "").replace(/,/g, "");
  if (raw === "" || raw === "-") return raw;
  const n = parseFloat(raw);
  return isNaN(n) ? raw : n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
}

export function Input({ value, onChange, placeholder, type = "text", prefix, suffix }) {
  const [focused, setFocused] = useState(false);
  const isAmount = prefix === "$";
  const displayValue = isAmount && !focused ? fmtAmount(value) : (value ?? "");

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ position: "absolute", left: 12, fontSize: 15, color: "#6b8f84", fontWeight: 500, pointerEvents: "none" }}>{prefix}</span>}
      <input
        type={isAmount ? "text" : type}
        inputMode={isAmount ? "numeric" : undefined}
        value={displayValue}
        onChange={e => onChange(e.target.value.replace(/,/g, ""))}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: prefix ? "11px 14px 11px 26px" : suffix ? "11px 36px 11px 14px" : "11px 14px",
          border: "1.5px solid #d4ddd9", borderRadius: 10,
          fontSize: 16, color: "#0f1a16", background: "#f9faf9",
          outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
        }}
        onFocus={e => { setFocused(true); e.target.style.borderColor = "#3d6b5e"; }}
        onBlur={e => { setFocused(false); e.target.style.borderColor = "#d4ddd9"; }}
      />
      {suffix && <span style={{ position: "absolute", right: 12, fontSize: 15, color: "#6b8f84", pointerEvents: "none" }}>{suffix}</span>}
    </div>
  );
}

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", padding: "11px 14px", border: "1.5px solid #d4ddd9",
        borderRadius: 10, fontSize: 16, color: "#0f1a16", background: "#f9faf9",
        outline: "none", fontFamily: "inherit", cursor: "pointer", appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b8f84' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center",
      }}
      onFocus={e => e.target.style.borderColor = "#3d6b5e"}
      onBlur={e => e.target.style.borderColor = "#d4ddd9"}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: "10px 0", border: "1.5px solid",
          borderColor: value === o.value ? "#3d6b5e" : "#d4ddd9",
          borderRadius: 10, fontSize: 15, fontWeight: value === o.value ? 500 : 400,
          color: value === o.value ? "#3d6b5e" : "#6b7a74",
          background: value === o.value ? "#eaf2ef" : "#f9faf9",
          cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function TwoCol({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>{children}</div>;
}

export function SectionDivider({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "#8a9e98", margin: "24px 0 16px", display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ flex: 1, height: 1, background: "#e2eae6" }} />
      {label}
      <div style={{ flex: 1, height: 1, background: "#e2eae6" }} />
    </div>
  );
}
