import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Plus, Pencil, Trash2, X, TrendingDown } from 'lucide-react';
import { api } from '../api.js';

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '$0';
const fmt2 = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';
const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' };

// Core amortization — returns { months, totalInterest, schedule (yearly snapshots) }
function amortize(balance, annualRate, monthlyPayment, extraMonthly = 0) {
  const r = annualRate / 100 / 12;
  const payment = monthlyPayment + extraMonthly;
  const minRequired = balance * r; // bare minimum to cover interest

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

    // Snapshot every 12 months
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

function LoanForm({ loan, onClose }) {
  const qc = useQueryClient();
  const isNew = !loan;
  const [form, setForm] = useState({
    name: loan?.name ?? '',
    balance: loan?.balance ?? '',
    interest_rate: loan?.interest_rate ?? '',
    monthly_payment: loan?.monthly_payment ?? '',
    extra_payment: loan?.extra_payment ?? 0,
    notes: loan?.notes ?? '',
  });

  const mut = useMutation({
    mutationFn: (data) => isNew ? api.loans.create(data) : api.loans.update(loan.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); onClose(); },
  });

  const f = (k) => ({ value: form[k], onChange: (e) => setForm(x => ({ ...x, [k]: e.target.value })) });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md">
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
              monthly_payment: parseFloat(form.monthly_payment),
              extra_payment: parseFloat(form.extra_payment) || 0,
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name *</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="e.g. Home Loan" required {...f('name')} />
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
              <label className="block text-xs text-slate-400 mb-1">Interest Rate (% p.a.) *</label>
              <div className="relative">
                <input type="number" min="0" max="30" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-8 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="6.14" required {...f('interest_rate')} />
                <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Monthly Payment *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="2800" required {...f('monthly_payment')} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Regular Extra</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" placeholder="0" {...f('extra_payment')} />
              </div>
            </div>
          </div>
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

function LoanCard({ loan, onEdit, onDelete }) {
  const [simExtra, setSimExtra] = useState(loan.extra_payment);

  const base = amortize(loan.balance, loan.interest_rate, loan.monthly_payment, loan.extra_payment);
  const sim  = amortize(loan.balance, loan.interest_rate, loan.monthly_payment, parseFloat(simExtra) || 0);

  const monthsSaved = isFinite(base.months) && isFinite(sim.months) ? base.months - sim.months : 0;
  const interestSaved = isFinite(base.totalInterest) && isFinite(sim.totalInterest)
    ? base.totalInterest - sim.totalInterest : 0;

  const simChanged = (parseFloat(simExtra) || 0) !== loan.extra_payment;

  // Merge schedules for chart (show up to ~360 months / 30 years)
  const chartData = base.schedule.map((pt, i) => ({
    label: pt.label,
    Current: Math.round(pt.balance),
    ...(simChanged ? { Simulated: Math.round(sim.schedule[i]?.balance ?? 0) } : {}),
  })).filter(pt => pt.Current > 0 || (simChanged && pt.Simulated > 0));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
      {/* Header */}
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

        {/* Key stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Balance</p>
            <p className="font-bold text-red-400 mt-0.5">{fmt(loan.balance)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Rate</p>
            <p className="font-bold text-amber-400 mt-0.5">{loan.interest_rate}% p.a.</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Monthly</p>
            <p className="font-bold text-indigo-400 mt-0.5">{fmt2(loan.monthly_payment + loan.extra_payment)}</p>
          </div>
        </div>
      </div>

      {/* Payoff info */}
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

      {/* Extra payment simulator */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Extra Repayment Simulator</p>
          {simChanged && <span className="text-xs text-indigo-400">simulating only — edit loan to save</span>}
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-slate-400 text-sm">$</span>
          <input
            type="number" min="0" step="50"
            className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            value={simExtra}
            onChange={e => setSimExtra(e.target.value)}
          />
          <span className="text-slate-400 text-sm">extra / month</span>
        </div>

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
            {simChanged && monthsSaved > 0 && (
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
        {simChanged && !isFinite(sim.months) && (
          <p className="text-red-400 text-sm">Payment too low to cover interest</p>
        )}
      </div>

      {/* Balance over time chart */}
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
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
