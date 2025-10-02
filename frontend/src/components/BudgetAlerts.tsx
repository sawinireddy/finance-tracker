import { useEffect, useState } from "react";
import { CATEGORIES } from "../constants/categories";

const KEY = "budgets:v1";

type Props = { month: string };
type Budgets = Record<string, number>;
type Tx = {
  id?: number;
  date?: string;
  category?: string;
  amount: number;
  type?: string;
  txType?: string;
  kind?: string;
};

const normalize = (s?: string) => (s ?? "Uncategorized").trim().toLowerCase();

function loadBudgets(): Budgets {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Budgets; }
  catch { return {}; }
}
function saveBudgets(b: Budgets) { localStorage.setItem(KEY, JSON.stringify(b)); }

function isExpense(t: Tx): boolean {
  const ty = String(t.type || t.txType || t.kind || "").toLowerCase();
  if (ty.includes("income") || ty.includes("credit")) return false;
  if (ty.includes("expense") || ty.includes("debit")) return true;
  if (t.amount < 0) return true;
  const incomeCats = ["income", "salary", "paycheck", "deposit", "credit", "bonus", "interest"];
  if (incomeCats.includes(normalize(t.category))) return false;
  return t.amount > 0;
}

function monthInfo(yyyyMm: string) {
  const [y, m] = (yyyyMm || "").split("-").map(Number);
  const totalDays = y && m ? new Date(y, m, 0).getDate() : 30;
  const now = new Date();
  const ymNow = { y: now.getFullYear(), m: now.getMonth() + 1 };
  const isSame = y === ymNow.y && m === ymNow.m;
  const isPast = y! < ymNow.y || (y === ymNow.y && (m ?? 99) < ymNow.m);
  const isFuture = y! > ymNow.y || (y === ymNow.y && (m ?? 0) > ymNow.m);
  const daysPassed = isSame ? Math.min(now.getDate(), totalDays) : isPast ? totalDays : 0;
  return { totalDays, daysPassed, isFuture };
}

function paceDot(delta: number) {
  if (delta > 0.01) return { bg: "var(--danger)", title: "Over pace" };
  if (delta < -0.01) return { bg: "var(--success)", title: "Under pace" };
  return { bg: "var(--muted)", title: "On pace" };
}

export default function BudgetAlerts({ month }: Props) {
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState<string>("");
  const [savedText, setSavedText] = useState("");
  const [budgets, setBudgets] = useState<Budgets>({});
  const [tx, setTx] = useState<Tx[]>([]);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => { setBudgets(loadBudgets()); }, []);
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoadErr("");
        const res = await fetch(`/api/tx?month=${month}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: Tx[] = Array.isArray(data) ? data : Array.isArray((data as any).content) ? (data as any).content : [];
        if (!ignore) setTx(list);
      } catch (e: any) {
        if (!ignore) { setLoadErr(e?.message || "Failed to load transactions"); setTx([]); }
      }
    })();
    return () => { ignore = true; };
  }, [month]);

  const onSave = () => {
    const raw = cat.trim();
    const l = parseFloat(limit);
    if (!raw || !isFinite(l) || l <= 0) { setSavedText("Enter a category and a positive limit."); return; }
    const keyNorm = normalize(raw);
    const next: Budgets = {};
    for (const [k, v] of Object.entries(budgets)) if (normalize(k) !== keyNorm) next[k] = v;
    next[raw] = l;
    setBudgets(next); saveBudgets(next); setSavedText(`Saved: ${raw} → $${l}`);
  };
  const removeBudget = (name: string) => {
    const norm = normalize(name);
    const next: Budgets = {};
    for (const [k, v] of Object.entries(budgets)) if (normalize(k) !== norm) next[k] = v;
    setBudgets(next); saveBudgets(next); setSavedText(`Removed: ${name}`);
  };

  const { totalDays, daysPassed, isFuture } = monthInfo(month);
  const totalExpense = tx.reduce((sum, t) => (isExpense(t) ? sum + Math.abs(t.amount) : sum), 0);
  const spendByNorm: Record<string, number> = tx.reduce((acc, t) => {
    if (isExpense(t)) {
      const k = normalize(t.category);
      acc[k] = (acc[k] || 0) + Math.abs(t.amount);
    }
    return acc;
  }, {} as Record<string, number>);

  const alerts = Object.entries(budgets)
    .map(([category, limit]) => {
      const spent = spendByNorm[normalize(category)] || 0;
      const ratio = limit > 0 ? spent / limit : 0;
      let level: "ok" | "warn" | "bad" = "ok";
      if (ratio >= 1) level = "bad";
      else if (ratio >= 0.8) level = "warn";
      const pct = Math.min(100, Math.round(ratio * 100));
      const expected = isFuture ? 0 : limit * (daysPassed / totalDays);
      const delta = spent - expected;
      return { category, limit, spent, ratio, level, pct, expected, delta };
    })
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div>
      {/* Input row */}
      <div className="row" style={{ gridTemplateColumns: "minmax(180px, 260px) 180px auto" }}>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Select category…</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="input" type="number" placeholder="Monthly limit (USD)" value={limit}
               onChange={(e) => setLimit(e.target.value)} />
        <button className="btn btn-primary" onClick={onSave}>Add / Update</button>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Preview: {cat || "(no category)"} — {limit ? `$${limit}` : "(no limit)"} {savedText && <> • <span style={{ color: "var(--primary-700)" }}>{savedText}</span></>}
      </p>

      {/* Saved budgets */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, margin: "8px 0" }}>Saved Budgets</div>
        {Object.keys(budgets).length === 0 ? (
          <p style={{ color: "var(--muted)" }}>None yet.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.entries(budgets).map(([c, l]) => (
              <li key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span><strong>{c}</strong>: ${l}</span>
                <button className="btn btn-ghost" onClick={() => removeBudget(c)} title="Remove">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Alerts */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, margin: "8px 0" }}>Budget Alerts</div>
        {alerts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No budgets to track yet.</p>
        ) : (
          <div className="row" style={{ gridTemplateColumns: "1fr", gap: 10 }}>
            {alerts.map((a) => {
              const barColor = a.level === "bad" ? "var(--danger)" : a.level === "warn" ? "var(--warn)" : "var(--primary)";
              const pace = paceDot(a.delta);
              return (
                <div key={a.category} className="card" style={{ padding: 12, marginTop: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span title={pace.title} style={{ width: 10, height: 10, borderRadius: "50%", background: pace.bg, display: "inline-block" }} />
                      <strong>{a.category}</strong>
                      <button className="btn btn-ghost" onClick={() => removeBudget(a.category)} title="Remove">✕</button>
                    </div>
                    <span className={`badge ${a.level === "bad" ? "badge-bad" : a.level === "warn" ? "badge-warn" : "badge-ok"}`}>
                      ${a.spent.toFixed(2)} / ${a.limit.toFixed(2)} ({a.pct}%)
                    </span>
                  </div>

                  <div className="bar" style={{ marginTop: 8 }}>
                    <span style={{ width: `${a.pct}%`, background: barColor }} />
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: a.delta > 0 ? "var(--danger)" : a.delta < 0 ? "var(--success)" : "var(--muted)" }}>
                    Pacing: should be ≤ ${a.expected.toFixed(2)}; you are <b>
                      {a.delta > 0 ? `${a.delta.toFixed(2)} over` : a.delta < 0 ? `${Math.abs(a.delta).toFixed(2)} under` : "on track"}
                    </b>.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {loadErr && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>⚠ {loadErr}</p>}
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
        This month: ${totalExpense.toFixed(2)} in expenses across {tx.length} transactions.
      </p>
    </div>
  );
}
