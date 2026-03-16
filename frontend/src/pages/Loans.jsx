import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Plus, Pencil, Trash2, X, TrendingDown, Link, Search, ChevronDown, ChevronUp, Settings, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '$0';
const fmt2 = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';
const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' };

// Simulate N months of payments, return resulting balance
function simulateBalance(initialBalance, annualRate, monthlyPayment, months) {
  const r = annualRate / 100 / 12;
  let balance = initialBalance;
  for (let i = 0; i < months && balance > 0.01; i++) {
    const interest = balance * r;
    const principal = monthlyPayment - interest;
    if (principal <= 0) break;
    balance = Math.max(0, balance - principal);
  }
  return balance;
}

function amortize(balance, annualRate, monthlyPayment, extraMonthly = 0) {
  const r = annualRate / 100 / 12;
  const payment = monthlyPayment + extraMonthly;
  const minRequired = balance * r;

  if (payment <= minRequired || balance <= 0 || r <= 0) {
    return { months: Infinity, totalInterest: Infinity, schedule: [] };
  }

  let remaining = balance;
  let totalInterest = 0;
  let month = 0;
  const schedule = [{ month: 0, label: 'Now', balance: remaining }];

  while (remaining > 0.01 && month < 600) {
    const interest = remaining * r;
    const principal = Math.min(payment - interest, remaining);
    remaining = Math.max(0, remaining - principal);
    totalInterest += interest;
    month++;

    if (month % 12 === 0 || remaining <= 0.01) {
      const yr = month / 12;
      const now = new Date();
      const date = new Date(now.getFullYear() + Math.floor(yr), now.getMonth() + (month % 12), 1);
      schedule.push({
        month,
        label: date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
        balance: remaining,
      });
    }
  }

  return { months: month, totalInterest, schedule };
}

function payoffDate(months) {
  if (!isFinite(months)) return 'Never (payment too low)';
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

function monthsToYears(months) {
  if (!isFinite(months)) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

// Modal to browse and pick a single expense
function ExpensePickerModal({ expenses, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = expenses.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget._closeOnUp = true; }}
      onMouseUp={(e) => { if (e.currentTarget._closeOnUp) { e.currentTarget._closeOnUp = false; onClose(); } }}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="font-semibold text-sm">Link Expense</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Search expenses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No expenses found</p>}
          {filtered.map(exp => (
            <button
              key={exp.id}
              onClick={() => { onSelect(exp); onClose(); }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-800 flex items-center justify-between group"
            >
              <span className="text-sm">{exp.name}</span>
              <span className="text-xs text-slate-500">{exp.schedule}{exp.fixed_amount ? ` · ${fmt2(exp.fixed_amount)}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// A payment field that can be either a manual amount or linked to an expense
function LinkedPaymentField({ label, amount, expenseId, expenses, onAmountChange, onLink, onUnlink }) {
  const [showPicker, setShowPicker] = useState(false);
  const linkedExp = expenseId ? expenses.find(e => e.id === expenseId) : null;

  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {linkedExp ? (
        <div className="flex items-center gap-2 bg-slate-800 border border-indigo-600/50 rounded-lg px-3 py-2">
          <Link size={13} className="text-indigo-400 shrink-0" />
          <span className="text-sm flex-1 truncate">{linkedExp.name}</span>
          <span className="text-xs text-slate-500">{linkedExp.schedule}</span>
          <button type="button" onClick={onUnlink} className="text-slate-500 hover:text-red-400 ml-1"><X size={13} /></button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
            <input
              type="number" min="0" step="0.01"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={amount}
              onChange={e => onAmountChange(e.target.value)}
              placeholder="0"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
            title="Link to expense"
          >
            <Link size={14} />
          </button>
        </div>
      )}
      {showPicker && (
        <ExpensePickerModal
          expenses={expenses}
          onSelect={(exp) => { onLink(exp.id); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function LoanForm({ loan, expenses, onClose }) {
  const qc = useQueryClient();
  const isNew = !loan;
  const [form, setForm] = useState({
    name: loan?.name ?? '',
    initial_balance: loan?.initial_balance ?? '',
    start_date: loan?.start_date ?? '',
    loan_term_years: loan?.loan_term_years ?? '',
    balance: loan?.balance ?? '',
    balance_date: loan?.balance_date ?? new Date().toISOString().slice(0, 10),
    interest_rate: loan?.interest_rate ?? '',
    monthly_payment: loan?.monthly_payment ?? '',
    extra_payment: loan?.extra_payment ?? 0,
    monthly_expense_id: loan?.monthly_expense_id ?? null,
    extra_expense_id: loan?.extra_expense_id ?? null,
    notes: loan?.notes ?? '',
    linked_expense_ids: loan?.linked_expense_ids ?? [],
  });

  const mut = useMutation({
    mutationFn: (data) => isNew ? api.loans.create(data) : api.loans.update(loan.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); onClose(); },
  });

  const f = (k) => ({ value: form[k], onChange: (e) => setForm(x => ({ ...x, [k]: e.target.value })) });
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget._closeOnUp = true; }}
      onMouseUp={(e) => { if (e.currentTarget._closeOnUp) { e.currentTarget._closeOnUp = false; onClose(); } }}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold">{isNew ? 'Add Loan' : 'Edit Loan'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate({
              ...form,
              balance: parseFloat(form.balance),
              interest_rate: parseFloat(form.interest_rate),
              monthly_payment: form.monthly_expense_id ? 0 : (parseFloat(form.monthly_payment) || 0),
              extra_payment: form.extra_expense_id ? 0 : (parseFloat(form.extra_payment) || 0),
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name *</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="e.g. Home Loan" required {...f('name')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Initial Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="500000" {...f('initial_balance')} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Start Date</label>
              <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" {...f('start_date')} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Loan Term</label>
              <div className="relative">
                <input type="number" min="1" max="50" step="1" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-10 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="30" {...f('loan_term_years')} />
                <span className="absolute right-3 top-2 text-slate-400 text-sm">yrs</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Current Balance *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="450000" required {...f('balance')} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Balance as of *</label>
              <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" required {...f('balance_date')} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Interest Rate (% p.a.) *</label>
            <div className="relative">
              <input type="number" min="0" max="30" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="6.14" required {...f('interest_rate')} />
              <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
            </div>
          </div>

          <LinkedPaymentField
            label="Min. Monthly Repayment"
            amount={form.monthly_payment}
            expenseId={form.monthly_expense_id}
            expenses={expenses}
            onAmountChange={v => set('monthly_payment', v)}
            onLink={id => set('monthly_expense_id', id)}
            onUnlink={() => set('monthly_expense_id', null)}
          />

          <LinkedPaymentField
            label="Extra Repayment"
            amount={form.extra_payment}
            expenseId={form.extra_expense_id}
            expenses={expenses}
            onAmountChange={v => set('extra_payment', v)}
            onLink={id => set('extra_expense_id', id)}
            onUnlink={() => set('extra_expense_id', null)}
          />

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="Optional notes..." {...f('notes')} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={mut.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm">
              {mut.isPending ? 'Saving...' : isNew ? 'Add Loan' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// "What extra do I need to pay off in N years?" calculator
function TargetPayoffCalc({ balance, rate, currentTotal }) {
  const [targetYears, setTargetYears] = useState('');
  const required = targetYears ? minPayment(balance, rate, parseFloat(targetYears)) : null;
  const extraNeeded = required !== null ? Math.max(0, required - currentTotal) : null;

  return (
    <div className="border-t border-slate-800 pt-4">
      <p className="text-xs text-slate-400 mb-2">Target payoff calculator</p>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">Pay off in</span>
        <div className="relative w-24">
          <input
            type="number" min="1" max="50" step="1"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            value={targetYears}
            onChange={e => setTargetYears(e.target.value)}
            placeholder="10"
          />
          <span className="absolute right-2 top-1.5 text-xs text-slate-500">yrs</span>
        </div>
        {extraNeeded !== null && (
          <span className="text-sm">
            {extraNeeded > 0
              ? <><span className="text-slate-400">pay extra </span><span className="font-semibold text-indigo-400">{(0 + extraNeeded).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}/mo</span></>
              : <span className="text-emerald-400 text-xs">Already on track with current payments</span>
            }
          </span>
        )}
      </div>
    </div>
  );
}

// Calculate minimum required payment for a given principal, rate, term
function minPayment(principal, annualRate, termYears) {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

const STAT_MODULES = [
  { id: 'aheadPrincipal',      label: 'Ahead on principal',          defaultOn: true,  note: 'Requires initial balance + start date' },
  { id: 'timeSaved',           label: 'Time saved off loan',          defaultOn: true,  note: 'Requires initial balance + start date' },
  { id: 'interestSavedToDate', label: 'Interest saved to date',       defaultOn: true,  note: 'Requires initial balance + start date' },
  { id: 'totalInterestSaved',  label: 'Total interest saved on track',defaultOn: true,  note: 'Requires initial balance + start date' },
  { id: 'dailyInterest',       label: 'Daily interest cost',          defaultOn: false },
  { id: 'thisMonthInterest',   label: "This month's interest charge",  defaultOn: false },
  { id: 'principalThisMonth',  label: 'Principal paid this month',    defaultOn: false },
  { id: 'equity',              label: 'Equity / principal paid',      defaultOn: false, note: 'Requires initial balance' },
  { id: 'totalPaidEstimate',   label: 'Total paid to date',           defaultOn: false, note: 'Requires initial balance + start date' },
  { id: 'payoffAtMin',         label: 'Payoff if no extra payments',  defaultOn: false },
  { id: 'interestRemaining',   label: 'Interest remaining',           defaultOn: false },
  { id: 'ltvRatio',            label: '% of loan remaining',          defaultOn: false, note: 'Requires initial balance' },
  { id: 'monthlyInterestRatio',label: 'Interest share of payment',    defaultOn: false },
];

const DEFAULT_STATS = Object.fromEntries(STAT_MODULES.map(m => [m.id, m.defaultOn]));

function loadStatsConfig() {
  try {
    const saved = localStorage.getItem('billy_loan_stats');
    return saved ? { ...DEFAULT_STATS, ...JSON.parse(saved) } : { ...DEFAULT_STATS };
  } catch { return { ...DEFAULT_STATS }; }
}

function LoanCard({ loan, onEdit, onDelete }) {
  const [simOpen, setSimOpen] = useState(false);
  const [simExtra, setSimExtra] = useState(0);
  const [simLump, setSimLump] = useState('');
  const [simRate, setSimRate] = useState('');
  const [statsConfig, setStatsConfig] = useState(loadStatsConfig);
  const [statsSettingsOpen, setStatsSettingsOpen] = useState(false);

  function toggleStat(id) {
    setStatsConfig(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('billy_loan_stats', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const currentBalance = loan.current_balance ?? loan.balance;
  const hasTracking = loan.balance_date && (loan.monthly_expense_id || loan.extra_expense_id || loan.linked_expense_ids?.length > 0);
  const paid = hasTracking ? Math.max(0, loan.balance - currentBalance) : 0;

  const effectiveMonthly = loan.effective_monthly ?? loan.monthly_payment;
  const effectiveExtra = loan.effective_extra ?? loan.extra_payment;

  const base = amortize(currentBalance, loan.interest_rate, effectiveMonthly, effectiveExtra);
  const lump = parseFloat(simLump) || 0;
  const extraSim = (parseFloat(simExtra) || 0);
  const rateSim = parseFloat(simRate) || loan.interest_rate;
  const simBalance = Math.max(0, currentBalance - lump);
  const sim = amortize(simBalance, rateSim, effectiveMonthly, effectiveExtra + extraSim);

  // Lifetime comparison: where would the balance be right now if only minimum was ever paid?
  const hasLifetime = loan.initial_balance && loan.start_date;
  const minPmt = effectiveMonthly;

  const monthsElapsed = hasLifetime ? (() => {
    const start = new Date(loan.start_date);
    const now = new Date();
    return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
  })() : 0;

  // Simulate where balance would be today if only ever paid minimum
  const minOnlyBalanceNow = hasLifetime
    ? simulateBalance(loan.initial_balance, loan.interest_rate, minPmt, monthsElapsed)
    : null;

  // Project forward from today
  const minRemainingScenario = minOnlyBalanceNow != null ? amortize(minOnlyBalanceNow, loan.interest_rate, minPmt) : null;
  const actualRemainingScenario = hasLifetime ? amortize(currentBalance, loan.interest_rate, minPmt) : null;
  const actualWithExtraScenario = hasLifetime ? amortize(currentBalance, loan.interest_rate, minPmt, effectiveExtra) : null;

  const aheadBy = minOnlyBalanceNow != null ? Math.max(0, minOnlyBalanceNow - currentBalance) : null;
  const lifetimeTimeSaved = minRemainingScenario && actualWithExtraScenario && isFinite(actualWithExtraScenario.months)
    ? minRemainingScenario.months - actualWithExtraScenario.months : null;

  // Interest saved to date: what min-only path paid in interest vs what you actually paid
  const principalPaidSoFar = hasLifetime ? Math.max(0, loan.initial_balance - currentBalance) : 0;
  const originalInterestSoFar = minOnlyBalanceNow != null
    ? monthsElapsed * minPmt - (loan.initial_balance - minOnlyBalanceNow) : null;
  const actualInterestSoFar = hasLifetime
    ? monthsElapsed * (minPmt + effectiveExtra) - principalPaidSoFar : null;
  const interestSavedToDate = originalInterestSoFar != null && actualInterestSoFar != null
    ? originalInterestSoFar - actualInterestSoFar : null;

  // Total interest saved on current track (past savings + future savings vs min-only path)
  const totalInterestMinOnly = originalInterestSoFar != null && minRemainingScenario
    ? originalInterestSoFar + minRemainingScenario.totalInterest : null;
  const totalInterestOnTrack = actualInterestSoFar != null && isFinite(base.totalInterest)
    ? Math.max(0, actualInterestSoFar) + base.totalInterest : null;
  const totalInterestSaved = totalInterestMinOnly != null && totalInterestOnTrack != null
    ? totalInterestMinOnly - totalInterestOnTrack : null;

  // Additional stat computations
  const r = loan.interest_rate / 100 / 12;
  const thisMonthInterest = currentBalance * r;
  const principalThisMonth = Math.max(0, (effectiveMonthly + effectiveExtra) - thisMonthInterest);
  const dailyInterest = currentBalance * loan.interest_rate / 100 / 365;
  const equity = loan.initial_balance ? Math.max(0, loan.initial_balance - currentBalance) : null;
  const ltvRatio = loan.initial_balance ? (currentBalance / loan.initial_balance) * 100 : null;
  const totalPaidEstimate = hasLifetime ? monthsElapsed * (minPmt + effectiveExtra) : null;
  const monthlyInterestRatio = (effectiveMonthly + effectiveExtra) > 0
    ? (thisMonthInterest / (effectiveMonthly + effectiveExtra)) * 100 : null;

  const monthsSaved = isFinite(base.months) && isFinite(sim.months) ? base.months - sim.months : 0;
  const interestSaved = isFinite(base.totalInterest) && isFinite(sim.totalInterest)
    ? base.totalInterest - sim.totalInterest : 0;

  const rateChanged = simRate !== '' && rateSim !== loan.interest_rate;
  const simChanged = extraSim > 0 || lump > 0 || rateChanged;

  const chartData = base.schedule.map((pt, i) => ({
    label: pt.label,
    Current: Math.round(pt.balance),
    ...(simChanged ? { Simulated: Math.round(sim.schedule[i]?.balance ?? 0) } : {}),
  })).filter(pt => pt.Current > 0 || (simChanged && pt.Simulated > 0));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{loan.name}</h3>
            {loan.notes && <p className="text-xs text-slate-500 mt-0.5">{loan.notes}</p>}
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded"><Pencil size={15} /></button>
            <button onClick={onDelete} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={15} /></button>
          </div>
        </div>

        {loan.initial_balance && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{fmt(currentBalance)} remaining of {fmt(loan.initial_balance)}</span>
              <span>{Math.round((1 - currentBalance / loan.initial_balance) * 100)}% paid off</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((1 - currentBalance / loan.initial_balance) * 100))}%` }}
              />
            </div>
            {loan.start_date && (
              <p className="text-xs text-slate-600 mt-1">Since {new Date(loan.start_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">{hasTracking ? 'Est. Current Balance' : 'Balance'}</p>
            <p className="font-bold text-red-400 mt-0.5">{fmt(currentBalance)}</p>
            {hasTracking && paid > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{fmt(paid)} paid since {new Date(loan.balance_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</p>
            )}
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Rate</p>
            <p className="font-bold text-amber-400 mt-0.5">{loan.interest_rate}% p.a.</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Monthly</p>
            <p className="font-bold text-indigo-400 mt-0.5">{fmt2(effectiveMonthly + effectiveExtra)}</p>
          </div>
        </div>
      </div>

      <div className="p-5 border-b border-slate-800">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Payoff date</p>
            <p className="font-semibold text-emerald-400">{payoffDate(base.months)}</p>
            <p className="text-xs text-slate-500 mt-0.5">{monthsToYears(base.months)} remaining</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Total interest</p>
            <p className="font-semibold text-orange-400">{fmt(base.totalInterest)}</p>
            <p className="text-xs text-slate-500 mt-0.5">over loan life</p>
          </div>
        </div>
      </div>

      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Loan Stats</p>
          <button
            onClick={() => setStatsSettingsOpen(o => !o)}
            className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
            title="Configure stats"
          >
            <Settings size={14} />
          </button>
        </div>

        {statsSettingsOpen && (
          <div className="mb-4 bg-slate-800 rounded-xl p-3 border border-slate-700">
            <p className="text-xs text-slate-400 mb-2 font-medium">Show / hide stats</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {STAT_MODULES.map(m => (
                <button key={m.id} onClick={() => toggleStat(m.id)} className="flex items-center gap-2 text-left group">
                  {statsConfig[m.id]
                    ? <Eye size={13} className="text-indigo-400 shrink-0" />
                    : <EyeOff size={13} className="text-slate-600 shrink-0" />}
                  <span className={`text-xs ${statsConfig[m.id] ? 'text-slate-300' : 'text-slate-600'} group-hover:text-slate-100 transition-colors`}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const statBoxes = {
            aheadPrincipal: aheadBy != null && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                <p className="text-xs text-emerald-500 mb-1">Ahead on principal</p>
                <p className="font-semibold text-emerald-400">{fmt(aheadBy)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">below min-only balance now</p>
              </div>
            ),
            timeSaved: lifetimeTimeSaved != null && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                <p className="text-xs text-emerald-500 mb-1">Time saved off loan</p>
                <p className="font-semibold text-emerald-400">{monthsToYears(lifetimeTimeSaved)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">at current pace from here</p>
              </div>
            ),
            interestSavedToDate: interestSavedToDate != null && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                <p className="text-xs text-emerald-500 mb-1">Interest saved to date</p>
                <p className="font-semibold text-emerald-400">{fmt(interestSavedToDate)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">vs min-only path so far</p>
              </div>
            ),
            totalInterestSaved: totalInterestSaved != null && (
              <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                <p className="text-xs text-emerald-500 mb-1">Total interest saved</p>
                <p className="font-semibold text-emerald-400">{fmt(totalInterestSaved)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">on current track, full loan</p>
              </div>
            ),
            dailyInterest: (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Daily interest cost</p>
                <p className="font-semibold text-orange-400">{fmt2(dailyInterest)}</p>
                <p className="text-xs text-slate-600 mt-0.5">per day at current balance</p>
              </div>
            ),
            thisMonthInterest: (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Interest this month</p>
                <p className="font-semibold text-orange-400">{fmt2(thisMonthInterest)}</p>
                <p className="text-xs text-slate-600 mt-0.5">of your next payment</p>
              </div>
            ),
            principalThisMonth: (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Principal this month</p>
                <p className="font-semibold text-indigo-400">{fmt2(principalThisMonth)}</p>
                <p className="text-xs text-slate-600 mt-0.5">actually reducing your debt</p>
              </div>
            ),
            equity: equity != null && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Equity built</p>
                <p className="font-semibold text-indigo-400">{fmt(equity)}</p>
                <p className="text-xs text-slate-600 mt-0.5">{ltvRatio != null ? `${(100 - ltvRatio).toFixed(1)}% owned` : 'principal paid off'}</p>
              </div>
            ),
            totalPaidEstimate: totalPaidEstimate != null && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Total paid to date</p>
                <p className="font-semibold text-slate-300">{fmt(totalPaidEstimate)}</p>
                <p className="text-xs text-slate-600 mt-0.5">est. over {monthsElapsed} months</p>
              </div>
            ),
            payoffAtMin: actualRemainingScenario && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Payoff if no extras</p>
                <p className="font-semibold text-slate-300">{payoffDate(actualRemainingScenario.months)}</p>
                <p className="text-xs text-slate-600 mt-0.5">{monthsToYears(actualRemainingScenario.months)} at min only</p>
              </div>
            ),
            interestRemaining: isFinite(base.totalInterest) && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Interest remaining</p>
                <p className="font-semibold text-orange-400">{fmt(base.totalInterest)}</p>
                <p className="text-xs text-slate-600 mt-0.5">at current pace</p>
              </div>
            ),
            ltvRatio: ltvRatio != null && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Loan remaining</p>
                <p className="font-semibold text-slate-300">{ltvRatio.toFixed(1)}%</p>
                <p className="text-xs text-slate-600 mt-0.5">of original amount</p>
              </div>
            ),
            monthlyInterestRatio: monthlyInterestRatio != null && (
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Interest share</p>
                <p className="font-semibold text-slate-300">{monthlyInterestRatio.toFixed(1)}%</p>
                <p className="text-xs text-slate-600 mt-0.5">of your payment is interest</p>
              </div>
            ),
          };

          const visible = STAT_MODULES.filter(m => statsConfig[m.id] && statBoxes[m.id]);
          if (visible.length === 0) return <p className="text-xs text-slate-600">No stats selected — click the cog to add some.</p>;
          return <div className="grid grid-cols-2 gap-3">{visible.map(m => <div key={m.id}>{statBoxes[m.id]}</div>)}</div>;
        })()}
      </div>

      <div className="border-b border-slate-800">
        <button
          className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/30 transition-colors"
          onClick={() => setSimOpen(o => !o)}
        >
          <span className="text-sm font-medium">Repayment Simulator</span>
          <div className="flex items-center gap-2">
            {simChanged && <span className="text-xs text-indigo-400">active</span>}
            {simOpen ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
          </div>
        </button>

        {simOpen && (
          <div className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Extra per month</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input type="number" min="0" step="50"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    value={simExtra} onChange={e => setSimExtra(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">One-off lump sum</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input type="number" min="0" step="1000"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    value={simLump} onChange={e => setSimLump(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Interest rate
                  <span className="text-slate-600 ml-1">({loan.interest_rate}% now)</span>
                </label>
                <div className="relative">
                  <input type="number" min="0" max="30" step="0.25"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-7 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    value={simRate} onChange={e => setSimRate(e.target.value)} placeholder={loan.interest_rate} />
                  <span className="absolute right-2 top-2 text-xs text-slate-500">%</span>
                </div>
              </div>
            </div>

            {rateChanged && (
              <div className={`text-xs px-3 py-2 rounded-lg ${rateSim > loan.interest_rate ? 'bg-red-900/30 text-red-400' : 'bg-emerald-900/30 text-emerald-400'}`}>
                Rate {rateSim > loan.interest_rate ? '▲' : '▼'} {Math.abs(rateSim - loan.interest_rate).toFixed(2)}% →
                new monthly interest charge: {fmt2(simBalance * rateSim / 100 / 12)}
              </div>
            )}

            {isFinite(sim.months) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Payoff date</p>
                  <p className="font-semibold text-emerald-400">{payoffDate(sim.months)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{monthsToYears(sim.months)} remaining</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Total interest</p>
                  <p className="font-semibold text-orange-400">{fmt(sim.totalInterest)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">over loan life</p>
                </div>
                {simChanged && isFinite(monthsSaved) && (
                  <>
                    <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                      <p className="text-xs text-emerald-500 mb-1">Time saved</p>
                      <p className="font-semibold text-emerald-400">{monthsToYears(monthsSaved)}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">vs current payments</p>
                    </div>
                    <div className="bg-emerald-900/30 border border-emerald-800/50 rounded-lg p-3">
                      <p className="text-xs text-emerald-500 mb-1">Interest saved</p>
                      <p className="font-semibold text-emerald-400">{fmt(interestSaved)}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">vs current payments</p>
                    </div>
                  </>
                )}
              </div>
            )}
            {!isFinite(sim.months) && (
              <p className="text-red-400 text-sm">Payment too low to cover interest</p>
            )}

            <TargetPayoffCalc balance={simBalance} rate={loan.interest_rate} currentTotal={effectiveMonthly + effectiveExtra} />
          </div>
        )}
      </div>

      {chartData.length > 1 && (
        <div className="p-5">
          <p className="text-sm font-medium mb-3">Balance Over Time</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(v)]} />
              <Line type="monotone" dataKey="Current" stroke="#6366f1" strokeWidth={2} dot={false} name="Current payments" />
              {simChanged && <Line type="monotone" dataKey="Simulated" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" name={`+${fmt2(parseFloat(simExtra) || 0)}/mo`} />}
              {simChanged && <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: '11px' }}>{v}</span>} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Loans() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: loans = [], isLoading } = useQuery({ queryKey: ['loans'], queryFn: api.loans.list });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });

  const deleteMut = useMutation({
    mutationFn: api.loans.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Loans</h2>
          <p className="text-slate-400 text-sm mt-1">Payoff tracking and extra repayment simulator</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Loan
        </button>
      </div>

      {isLoading && <div className="text-slate-400">Loading...</div>}

      <div className="space-y-6">
        {loans.map(loan => (
          <LoanCard
            key={loan.id}
            loan={loan}
            onEdit={() => setModal(loan)}
            onDelete={() => { if (confirm(`Delete "${loan.name}"?`)) deleteMut.mutate(loan.id); }}
          />
        ))}
        {!isLoading && loans.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
            <p>No loans tracked yet. Add your mortgage or any other loan.</p>
          </div>
        )}
      </div>

      {modal && (
        <LoanForm
          loan={modal === 'new' ? null : modal}
          expenses={expenses}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
