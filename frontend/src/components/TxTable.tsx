import { useMemo, useState } from "react";
import { Tx } from "../api";

type Props = {
  items: Tx[];
  onDelete?: (id: number) => void;
  onDuplicate?: (tx: Tx) => void;
};

type SortKey = "date" | "merchant" | "amount" | "category";

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

function isIncomeTx(t: Tx): boolean {
  const ty = String((t as any).type || (t as any).txType || (t as any).kind || "").toLowerCase();
  if (ty.includes("income") || ty.includes("credit")) return true;
  if (ty.includes("expense") || ty.includes("debit")) return false;
  const cat = String(t.category || "").trim().toLowerCase();
  const incomeCats = ["income", "salary", "paycheck", "deposit", "bonus", "interest", "credit"];
  if (incomeCats.includes(cat)) return true;
  if (typeof t.amount === "number") {
    if (t.amount < 0) return true;
    if (t.amount > 0) return false;
  }
  return false;
}

export default function TxTable({ items, onDelete, onDuplicate }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      let va: any, vb: any;
      if (sortBy === "date") {
        va = new Date(a.date || "").getTime() || 0;
        vb = new Date(b.date || "").getTime() || 0;
      } else if (sortBy === "amount") {
        va = Number(a.amount || 0);
        vb = Number(b.amount || 0);
      } else if (sortBy === "merchant") {
        va = (a.merchant || "").toLowerCase();
        vb = (b.merchant || "").toLowerCase();
      } else {
        va = (a.category || "").toLowerCase();
        vb = (b.category || "").toLowerCase();
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [items, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortBy) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "date" ? "desc" : "asc"); }
  }
  function sortIcon(key: SortKey) {
    if (key !== sortBy) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  }

  const totalIncome = useMemo(
    () => sorted.reduce((s, t) => s + (isIncomeTx(t) ? Math.abs(t.amount) : 0), 0),
    [sorted]
  );
  const totalExpense = useMemo(
    () => sorted.reduce((s, t) => s + (!isIncomeTx(t) ? Math.abs(t.amount) : 0), 0),
    [sorted]
  );
  const net = totalIncome - totalExpense;

  return (
    <div className="table-wrap">
      <div style={{ padding: "6px 8px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
        Tip: click column headers to sort
      </div>

      <table className="table">
        <thead>
          <tr>
            <th onClick={() => toggleSort("date")} title="Click to sort">
              Date <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>{sortIcon("date")}</span>
            </th>
            <th onClick={() => toggleSort("merchant")} title="Click to sort">
              Merchant <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>{sortIcon("merchant")}</span>
            </th>
            <th onClick={() => toggleSort("amount")} title="Click to sort">
              Amount <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>{sortIcon("amount")}</span>
            </th>
            <th onClick={() => toggleSort("category")} title="Click to sort">
              Category <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>{sortIcon("category")}</span>
            </th>
            <th style={{ cursor: "default" }}>Notes</th>
            <th style={{ cursor: "default", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No transactions.</td></tr>
          )}
          {sorted.map((t, i) => {
            const income = isIncomeTx(t);
            const amtColor = income ? "var(--success)" : "var(--danger)";
            return (
              <tr key={t.id ?? `${t.date}-${t.merchant}-${i}`}>
                <td>{t.date}</td>
                <td>{t.merchant}</td>
                <td style={{ color: amtColor, fontWeight: 600 }}>
                  {fmtMoney(Math.abs(t.amount))}
                </td>
                <td>{t.category}</td>
                <td style={{ color: "#475569" }}>{(t as any).notes ?? ""}</td>
                <td style={{ textAlign: "right" }}>
                  {onDuplicate && (
                    <button className="btn btn-ghost" onClick={() => onDuplicate(t)} title="Duplicate" style={{ marginRight: 6 }}>
                      Duplicate
                    </button>
                  )}
                  {onDelete && typeof t.id === "number" && (
                    <button className="btn btn-ghost" onClick={() => onDelete(t.id as number)} title="Delete">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <td colSpan={2}>Totals (shown rows)</td>
            <td style={{ color: "var(--danger)" }}>Expense: {fmtMoney(totalExpense)}</td>
            <td style={{ color: "var(--success)" }}>Income: {fmtMoney(totalIncome)}</td>
            <td style={{ color: net >= 0 ? "var(--success)" : "var(--danger)" }}>
              Net: {fmtMoney(net)}
            </td>
            <td style={{ textAlign: "right", color: "var(--muted)", fontWeight: 400 }}>
              {sorted.length} rows
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
