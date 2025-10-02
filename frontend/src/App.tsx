import { useEffect, useState } from 'react'
import { api, Tx } from './api'
import TxTable from './components/TxTable'
import BudgetAlerts from './components/BudgetAlerts'
import { CATEGORIES } from './constants/categories'
import './theme.css'

const PREF_KEY = 'filters:v1'
const DARK_KEY = 'pref:dark'

/* ========================= helpers ========================= */
function lastDayOfMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return ''
  return String(new Date(y, m, 0).getDate()).padStart(2, '0')
}
function prevMonthOf(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return ''
  const d = new Date(y, (m - 1), 1)
  d.setMonth(d.getMonth() - 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}
function fmtMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return yyyyMm
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })
}
function isIncomeTx(t: Tx): boolean {
  const ty = String((t as any).type || (t as any).txType || (t as any).kind || '').toLowerCase()
  if (ty.includes('income') || ty.includes('credit')) return true
  if (ty.includes('expense') || ty.includes('debit')) return false
  const cat = String(t.category || '').trim().toLowerCase()
  const incomeCats = ['income', 'salary', 'paycheck', 'deposit', 'bonus', 'interest', 'credit']
  if (incomeCats.includes(cat)) return true
  if (typeof t.amount === 'number') {
    if (t.amount < 0) return true
    if (t.amount > 0) return false
  }
  return false
}
function normalizeSummary(s: any, rows: Tx[]) {
  const incomeFromRows  = rows.reduce((a, t) => a + (isIncomeTx(t) ? Math.abs(t.amount) : 0), 0)
  const expenseFromRows = rows.reduce((a, t) => a + (!isIncomeTx(t) ? Math.abs(t.amount) : 0), 0)
  const byCatFromRows = rows.reduce((acc, t) => {
    if (!isIncomeTx(t)) {
      const k = (t.category || 'Uncategorized').trim() || 'Uncategorized'
      acc[k] = (acc[k] || 0) + Math.abs(t.amount || 0)
    }
    return acc
  }, {} as Record<string, number>)

  const byCat   = s?.byCategory ?? s?.categoryTotals ?? byCatFromRows
  const income  = s?.totalIncome ?? s?.income ?? incomeFromRows
  const expense = s?.totalExpense ?? s?.expense ?? expenseFromRows
  const net     = s?.net ?? (income - expense)
  const count   = s?.count ?? rows.length
  return { income, expense, net, count, byCat }
}
// Build weekly buckets for a month: 1–7, 8–14, 15–21, 22–28, 29–end
function computeWeekBuckets(rows: Tx[], yyyyMm: string) {
  const [y, m] = yyyyMm.split('-').map(Number)
  if (!y || !m) return { labels: [], ranges: [] as [string,string][], expense: [] as number[] }
  const totalDays = Number(lastDayOfMonth(yyyyMm))
  const ranges: Array<[number, number]> = []
  for (let start = 1; start <= totalDays; start += 7) {
    const end = Math.min(start + 6, totalDays)
    ranges.push([start, end])
  }
  const labels = ranges.map(([s, e], i) => `W${i + 1} (${s}–${e})`)
  const isoRanges: [string, string][] = ranges.map(([s, e]) => {
    const sIso = `${yyyyMm}-${String(s).padStart(2, '0')}`
    const eIso = `${yyyyMm}-${String(e).padStart(2, '0')}`
    return [sIso, eIso]
  })
  const expense = new Array(ranges.length).fill(0)
  for (const t of rows) {
    if (!t.date) continue
    const day = Number(t.date.split('-')[2])
    if (!Number.isFinite(day)) continue
    const idx = ranges.findIndex(([s, e]) => day >= s && day <= e)
    if (idx === -1) continue
    if (!isIncomeTx(t)) expense[idx] += Math.abs(t.amount || 0)
  }
  return { labels, ranges: isoRanges, expense }
}

/* ========================= App ========================= */
export default function App() {
  // Data + filters
  const [items, setItems] = useState<Tx[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('')

  // Month (shared)
  const [month, setMonth] = useState('2025-09')

  // Chart data (unfiltered month tx)
  const [monthTx, setMonthTx] = useState<Tx[]>([])
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)

  // Summary + compare + AI
  const [summary, setSummary] = useState<any>(null)
  const [prevSummary, setPrevSummary] = useState<any>(null)
  const [insight, setInsight] = useState<string>('')

  // Dark mode (persisted)
  const [dark, setDark] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(DARK_KEY) || 'false') } catch { return false }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem(DARK_KEY, JSON.stringify(dark)) } catch {}
  }, [dark])

  // Toast
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | null }>({ msg: '', kind: null })
  function showToast(msg: string, kind: 'success' | 'error' = 'success') {
    setToast({ msg, kind }); setTimeout(() => setToast({ msg: '', kind: null }), 2500)
  }

  // API calls
  async function load() {
    const r = await api.get<Tx[]>('/tx', { params: { q, from, to, category } })
    setItems(r.data)
  }
  async function loadMonthTx(yyyyMm: string) {
    if (!yyyyMm) return
    const last = lastDayOfMonth(yyyyMm)
    const fromR = `${yyyyMm}-01`
    const toR = `${yyyyMm}-${last}`
    const r = await api.get<Tx[]>('/tx', { params: { from: fromR, to: toR } })
    setMonthTx(r.data)
  }
  async function computeSummary() {
    const cur = await api.get('/tx/summary', { params: { month } })
    setSummary(cur.data)
    try {
      const pm = prevMonthOf(month)
      if (pm) {
        const prev = await api.get('/tx/summary', { params: { month: pm } })
        setPrevSummary(prev.data)
      } else setPrevSummary(null)
    } catch { setPrevSummary(null) }
    try {
      const i = await api.get('/tx/insights', { params: { month } })
      setInsight(i.data.summary)
    } catch { setInsight('') }
    await loadMonthTx(month)
  }

  // Mutations
  async function addTx(e: any) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const kind = (form.get('kind') as string) || 'expense'
    let amt = Number(form.get('amount') || 0)
    if (!isFinite(amt)) amt = 0
    // normalize: expense = +, income = -
    amt = kind === 'income' ? -Math.abs(amt) : Math.abs(amt)
    const payload: Tx = {
      date: (form.get('date') as string) || new Date().toISOString().slice(0, 10),
      merchant: (form.get('merchant') as string) || '',
      amount: amt,
      category: (form.get('category') as string) || 'Other',
      notes: (form.get('notes') as string) || ''
    }
    await api.post('/tx', payload)
    e.currentTarget.reset()
    await load()
    await loadMonthTx(month)
    showToast('Transaction added')
  }
  async function deleteTx(id: number) {
    if (!id) return
    if (!confirm('Delete this transaction?')) return
    await api.delete(`/tx/${id}`)
    await load()
    await loadMonthTx(month)
    showToast('Transaction deleted')
  }
  async function duplicateTx(tx: Tx) {
    const payload: Tx = { ...tx, id: undefined as any, date: new Date().toISOString().slice(0, 10) }
    await api.post('/tx', payload)
    await load()
    await loadMonthTx(month)
    showToast('Transaction duplicated')
  }
  async function clearFilters() {
    setQ(''); setFrom(''); setTo(''); setCategory('')
    const r = await api.get<Tx[]>('/tx', { params: { q: '', from: '', to: '', category: '' } })
    setItems(r.data)
    showToast('Filters cleared')
  }
  function exportCsv() {
    const headers = ['id','date','merchant','amount','category','notes']
    const lines = [headers.join(',')]
    for (const t of items) {
      const row = [t.id ?? '', t.date ?? '', t.merchant ?? '', String(t.amount ?? ''), t.category ?? '', (t as any).notes ?? '']
        .map(v => { const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s })
      lines.push(row.join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions_${(month || '').replace('-', '') || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported')
  }

  // Effects
  useEffect(() => {
    (async function init() {
      try {
        const raw = localStorage.getItem(PREF_KEY)
        if (!raw) { await load(); await loadMonthTx(month); return }
        const saved = JSON.parse(raw) as { q?: string; from?: string; to?: string; category?: string; month?: string }
        const Q = saved.q ?? '', F = saved.from ?? '', T = saved.to ?? '', C = saved.category ?? '', M = saved.month ?? month
        setQ(Q); setFrom(F); setTo(T); setCategory(C); if (M) setMonth(M)
        const r = await api.get<Tx[]>('/tx', { params: { q: Q, from: F, to: T, category: C } })
        setItems(r.data)
        await loadMonthTx(M)
      } catch { await load(); await loadMonthTx(month) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ q, from, to, category, month })) } catch {}
  }, [q, from, to, category, month])
  useEffect(() => {
    if (!month || month.length !== 7) return
    const last = lastDayOfMonth(month)
    const newFrom = `${month}-01`
    const newTo = `${month}-${last}`
    setFrom(newFrom); setTo(newTo); setSelectedWeek(null)
    ;(async () => {
      const r = await api.get<Tx[]>('/tx', { params: { q, from: newFrom, to: newTo, category } })
      setItems(r.data)
      await loadMonthTx(month)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  // Derived
  const fmtMoney = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
  const totalIncome  = items.reduce((s, t) => s + (isIncomeTx(t) ? Math.abs(t.amount) : 0), 0)
  const totalExpense = items.reduce((s, t) => s + (!isIncomeTx(t) ? Math.abs(t.amount) : 0), 0)
  const net = totalIncome - totalExpense

  // Chart
  const wk = computeWeekBuckets(monthTx, month)
  const maxY = Math.max(1, ...wk.expense)
  const chart = wk.labels.length ? (
    <div style={{ margin: '6px 0 12px' }}>
      <svg viewBox="0 0 560 180" width="100%" height={180} role="img" aria-label="Weekly expenses bar chart">
        {/* grid + y ticks */}
        {[0, 0.5, 1].map((t, j) => {
          const padL = 36, padB = 26, padT = 8, padR = 8
          const innerW = 560 - padL - padR, innerH = 180 - padT - padB
          const y = padT + innerH * (1 - t)
          const val = maxY * t
          return (
            <g key={j}>
              <line x1={padL} y1={y} x2={560 - padR} y2={y} stroke="#e8f3ef" />
              <text x={padL - 6} y={y + 4} fontSize="10" fill="var(--muted)" textAnchor="end">{fmtMoney(val)}</text>
            </g>
          )
        })}
        {/* bars */}
        {(() => {
          const padL = 36, padB = 26, padT = 8, padR = 8
          const innerW = 560 - padL - padR, innerH = 180 - padT - padB
          const n = wk.expense.length, gap = innerW / n, barW = Math.max(20, gap * 0.55)
          return wk.expense.map((v, i) => {
            const x = padL + gap * i + (gap - barW) / 2
            const h = (v / maxY) * innerH
            const y = padT + innerH - h
            const active = selectedWeek === i
            return (
              <g key={i} onClick={async () => {
                if (selectedWeek === i) {
                  const last = lastDayOfMonth(month)
                  const newFrom = `${month}-01`, newTo = `${month}-${last}`
                  setSelectedWeek(null); setFrom(newFrom); setTo(newTo)
                  const r = await api.get<Tx[]>('/tx', { params: { q, from: newFrom, to: newTo, category } })
                  setItems(r.data)
                } else {
                  const [sIso, eIso] = wk.ranges[i]
                  setSelectedWeek(i); setFrom(sIso); setTo(eIso)
                  const r = await api.get<Tx[]>('/tx', { params: { q, from: sIso, to: eIso, category } })
                  setItems(r.data)
                }
              }} style={{ cursor: 'pointer' }}>
                <rect
                  x={x} y={y} width={barW} height={Math.max(1, h)}
                  fill={active ? 'var(--primary-700)' : 'var(--primary)'} opacity={active ? 1 : 0.92}
                />
                <title>{`${wk.labels[i]} • ${fmtMoney(v)}`}</title>
                <text x={x + barW / 2} y={172} fontSize="11" fill="#374151" textAnchor="middle">
                  {wk.labels[i].split(' ')[0]}
                </text>
              </g>
            )
          })
        })()}
      </svg>
      <div className="chart-note">click a bar to filter</div>
    </div>
  ) : null

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: 18 }}>
      {/* Header + Dark toggle */}
      <header className="row" style={{ justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <h1 className="h1" style={{ fontWeight: 800, letterSpacing: '.2px' }}>Finance Tracker</h1>
        <button className="btn btn-outline" onClick={() => setDark(d => !d)} title="Toggle dark mode">
          {dark ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>

      {/* ===== 1) ADD TRANSACTION ===== */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Add Transaction</h2>
        </div>
        <form onSubmit={addTx} className="row" style={{ gridTemplateColumns: '120px 1fr 140px 140px 180px 1fr auto' }}>
          <input name="date" type="date" className="input" aria-label="Date" />
          <input name="merchant" placeholder="Merchant" className="input" aria-label="Merchant" />
          <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" aria-label="Amount" />
          <select name="kind" defaultValue="expense" className="select" aria-label="Type">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <select name="category" defaultValue="" className="select" aria-label="Category">
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="notes" placeholder="Notes" className="input" aria-label="Notes" />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      </section>

      {/* ===== 2) MONTHLY SUMMARY ===== */}
      <section className="card">
        <div className="card-header" style={{ justifyContent:'center' }}>
          <div className="row" style={{ width:'100%', maxWidth:680, justifyContent:'center' }}>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="input"
              style={{ width: 160, maxWidth: 220 }}
              aria-label="Select month"
            />
            <button onClick={computeSummary} className="btn btn-primary">Compute</button>
            {selectedWeek !== null && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  const last = lastDayOfMonth(month)
                  const newFrom = `${month}-01`, newTo = `${month}-${last}`
                  setSelectedWeek(null); setFrom(newFrom); setTo(newTo)
                  const r = await api.get<Tx[]>('/tx', { params: { q, from: newFrom, to: newTo, category } })
                  setItems(r.data)
                }}
              >
                Clear Week Filter
              </button>
            )}
          </div>
        </div>

        {/* Chart */}
        {chart}

        {/* Summary */}
        {summary ? (() => {
          const S = normalizeSummary(summary, items)
          const top = Object.entries(S.byCat || {}).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5)
          const Chip = (p: {label: string; value: string; color?: string}) => (
            <div className="chip"><label>{p.label}</label><b style={{ color: p.color }}>{p.value}</b></div>
          )
          return (
            <>
              <div className="chips">
                <Chip label="Income" value={fmtMoney(S.income)} color="var(--success)" />
                <Chip label="Expense" value={fmtMoney(S.expense)} color="var(--danger)" />
                <Chip label="Net" value={fmtMoney(S.net)} color={S.net >= 0 ? 'var(--success)' : 'var(--danger)'} />
                <Chip label="Transactions" value={String(S.count)} />
              </div>

              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Top categories</div>
                {top.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>No expenses to show.</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Spent</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map(([name, spent]) => {
                        const pct = S.expense > 0 ? Math.round(((spent as number) / S.expense) * 100) : 0
                        return (
                          <tr key={name}>
                            <td><b>{name}</b></td>
                            <td style={{ textAlign: 'right' }}>{fmtMoney(spent as number)}</td>
                            <td>
                              <div className="bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pct}%</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Compare vs last month */}
              {prevSummary && (() => {
                const prevM = prevMonthOf(month)
                const prev = normalizeSummary(prevSummary, [] as Tx[])
                const diffIncome = S.income - prev.income
                const diffExpense = S.expense - prev.expense
                const diffNet = S.net - prev.net
                const deltaPct = (cur: number, p: number) => (!isFinite(p) || Math.abs(p) < 1e-9) ? null : ((cur - p) / p) * 100
                const pI = deltaPct(S.income, prev.income)
                const pE = deltaPct(S.expense, prev.expense)
                const pN = deltaPct(S.net, prev.net)
                const DeltaChip = ({ label, val, pct }: { label: string; val: number; pct: number | null }) => {
                  const up = val > 0.005, down = val < -0.005
                  const goodFor = label === 'Expense' ? !up : up
                  return (
                    <div className="chip" style={{ minWidth: 180 }}>
                      <label>{label} — {fmtMonthLabel(prevM)} → {fmtMonthLabel(month)}</label>
                      <b style={{ color: goodFor ? 'var(--success)' : 'var(--danger)' }}>
                        {up ? '▲' : down ? '▼' : '•'} {fmtMoney(Math.abs(val))}
                      </b>
                      <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                        {pct == null ? '–' : `${Math.abs(pct).toFixed(0)}%`}
                      </span>
                    </div>
                  )
                }
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>What changed vs last month</div>
                    <div className="chips">
                      <DeltaChip label="Income" val={diffIncome} pct={pI} />
                      <DeltaChip label="Expense" val={diffExpense} pct={pE} />
                      <DeltaChip label="Net" val={diffNet} pct={pN} />
                    </div>
                  </div>
                )
              })()}

              {insight && <p style={{ marginTop: 12 }}><b>AI Insight:</b> {insight}</p>}
            </>
          )
        })() : (
          <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
            Pick a month and click <b>Compute</b> to view the summary.
          </p>
        )}
      </section>

      {/* ===== 3) BUDGETS ===== */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Budgets &amp; Alerts</h2>
        </div>
        <BudgetAlerts month={month} />
      </section>

      {/* ===== 4) TRANSACTIONS ===== */}
      <section className="card table-card">
        <div className="card-header">
          <h2 className="card-title">Transactions</h2>
          <div className="card-actions">
            <button type="button" onClick={exportCsv} className="btn btn-outline">Export CSV</button>
          </div>
        </div>

        {/* Filters */}
        <form
          onSubmit={e => { e.preventDefault(); load() }}
          className="row"
          style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto auto', margin: '8px 0 12px' }}
        >
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search merchant/category/notes" className="input" aria-label="Search" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input" aria-label="From date" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input" aria-label="To date" />
          <select value={category} onChange={e => setCategory(e.target.value)} className="select" aria-label="Category filter">
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="btn btn-primary">Filter</button>
          <button type="button" onClick={clearFilters} className="btn btn-outline">Clear</button>
          <button type="button" onClick={exportCsv} className="btn btn-outline">Export CSV</button>
        </form>

        {/* Live totals for CURRENT VIEW */}
        <div className="chips" style={{ marginTop: 0 }}>
          <div className="chip"><label>Income (shown)</label><b style={{ color: 'var(--success)' }}>{fmtMoney(totalIncome)}</b></div>
          <div className="chip"><label>Expense (shown)</label><b style={{ color: 'var(--danger)' }}>{fmtMoney(totalExpense)}</b></div>
          <div className="chip"><label>Net (shown)</label>
            <b style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtMoney(net)}</b>
          </div>
        </div>

        <TxTable items={items} onDelete={deleteTx} onDuplicate={duplicateTx} />
      </section>

      {/* Toast */}
      {toast.kind && (
        <div className={`toast ${toast.kind === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.msg}
        </div>
      )}
    </main>
  )
}
