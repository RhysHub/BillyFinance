import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Target, Link, Search } from 'lucide-react';
import { api } from '../api.js';

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '$0';
const fmt2 = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';

function monthsToYears(months) {
  if (months == null || !isFinite(months)) return '—';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

function goalDate(months) {
  if (months == null || !isFinite(months)) return '—';
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

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
            <input autoFocus className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filtered.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No expenses found</p>}
          {filtered.map(exp => (
            <button key={exp.id} onClick={() => { onSelect(exp); onClose(); }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-800 flex items-center justify-between">
              <span className="text-sm">{exp.name}</span>
              <span className="text-xs text-slate-500">{exp.schedule}{exp.fixed_amount ? ` · ${fmt2(exp.fixed_amount)}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
const CONTRIBUTION_SCHEDULES = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'];

function GoalForm({ goal, expenses, onClose }) {
  const qc = useQueryClient();
  const isNew = !goal;
  const [form, setForm] = useState({
    name: goal?.name ?? '',
    target_amount: goal?.target_amount ?? '',
    current_amount: goal?.current_amount ?? '',
    current_amount_date: goal?.current_amount_date ?? new Date().toISOString().slice(0, 10),
    monthly_contribution: goal?.monthly_contribution ?? '',
    contribution_schedule: goal?.contribution_schedule ?? 'MONTHLY',
    contribution_expense_id: goal?.contribution_expense_id ?? null,
    color: goal?.color ?? '#6366f1',
    notes: goal?.notes ?? '',
  });
  const [showPicker, setShowPicker] = useState(false);

  const mut = useMutation({
    mutationFn: (data) => isNew ? api.savingsGoals.create(data) : api.savingsGoals.update(goal.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['savings-goals'] }); onClose(); },
  });

  const f = (k) => ({ value: form[k], onChange: (e) => setForm(x => ({ ...x, [k]: e.target.value })) });
  const set = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const linkedExp = form.contribution_expense_id ? expenses.find(e => e.id === form.contribution_expense_id) : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget._closeOnUp = true; }}
      onMouseUp={(e) => { if (e.currentTarget._closeOnUp) { e.currentTarget._closeOnUp = false; onClose(); } }}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold">{isNew ? 'Add Savings Goal' : 'Edit Goal'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          mut.mutate({
            ...form,
            target_amount: parseFloat(form.target_amount),
            current_amount: parseFloat(form.current_amount) || 0,
            monthly_contribution: form.contribution_expense_id ? 0 : (parseFloat(form.monthly_contribution) || 0),
          });
        }} className="p-5 space-y-4">

          <div>
            <label className="block text-xs text-slate-400 mb-1">Goal Name *</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Emergency Fund, Holiday, Renovation" required {...f('name')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="20000" required {...f('target_amount')} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Current Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="0" {...f('current_amount')} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Balance as of</label>
            <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" {...f('current_amount_date')} />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Contribution</label>
            {linkedExp ? (
              <div className="flex items-center gap-2 bg-slate-800 border border-indigo-600/50 rounded-lg px-3 py-2">
                <Link size={13} className="text-indigo-400 shrink-0" />
                <span className="text-sm flex-1 truncate">{linkedExp.name}</span>
                <span className="text-xs text-slate-500">{linkedExp.schedule}</span>
                <button type="button" onClick={() => set('contribution_expense_id', null)} className="text-slate-500 hover:text-red-400 ml-1"><X size={13} /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="500" {...f('monthly_contribution')} />
                </div>
                <select value={form.contribution_schedule} onChange={e => set('contribution_schedule', e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-300">
                  {CONTRIBUTION_SCHEDULES.map(s => (
                    <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowPicker(true)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors" title="Link to expense">
                  <Link size={14} />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Optional notes..." {...f('notes')} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={mut.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm">
              {mut.isPending ? 'Saving...' : isNew ? 'Add Goal' : 'Save'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      </div>
      {showPicker && <ExpensePickerModal expenses={expenses} onSelect={(exp) => set('contribution_expense_id', exp.id)} onClose={() => setShowPicker(false)} />}
    </div>
  );
}

function GoalCard({ goal, onEdit, onDelete }) {
  const pct = Math.min(100, goal.progress_pct ?? 0);
  const remaining = goal.remaining ?? 0;
  const monthly = goal.effective_monthly ?? 0;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: goal.color }} />
            <div>
              <h3 className="font-semibold text-lg">{goal.name}</h3>
              {goal.notes && <p className="text-xs text-slate-500 mt-0.5">{goal.notes}</p>}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded"><Pencil size={15} /></button>
            <button onClick={onDelete} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={15} /></button>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{fmt(goal.estimated_current)} saved of {fmt(goal.target_amount)}</span>
            <span>{pct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3">
            <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Saved</p>
            <p className="font-bold text-emerald-400 mt-0.5">{fmt(goal.estimated_current)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Remaining</p>
            <p className="font-bold text-amber-400 mt-0.5">{fmt(remaining)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-500">Contribution</p>
            <p className="font-bold text-indigo-400 mt-0.5">{fmt2(monthly)}<span className="text-xs text-slate-500 font-normal">/mo</span></p>
          </div>
        </div>
      </div>

      {monthly > 0 && (
        <div className="p-5 border-b border-slate-800">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Goal reached</p>
              <p className="font-semibold text-emerald-400">{goalDate(goal.months_to_goal)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{monthsToYears(goal.months_to_goal)} away</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">At current rate</p>
              <p className="font-semibold text-slate-300">{fmt2(monthly)}/mo</p>
              <p className="text-xs text-slate-500 mt-0.5">{fmt(monthly * 12)}/yr</p>
            </div>
          </div>
        </div>
      )}

      {monthly > 0 && remaining > 0 && (
        <div className="p-5">
          <p className="text-xs text-slate-500 mb-3">What if I contributed more?</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[monthly * 1.25, monthly * 1.5, monthly * 2].map(boost => {
              const months = Math.ceil(remaining / boost);
              return (
                <div key={boost} className="bg-slate-800 rounded-lg p-3">
                  <p className="text-xs text-indigo-400 font-medium">{fmt2(boost)}/mo</p>
                  <p className="text-sm font-semibold text-slate-200 mt-1">{monthsToYears(months)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{goalDate(months)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SavingsGoals() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: goals = [], isLoading } = useQuery({ queryKey: ['savings-goals'], queryFn: api.savingsGoals.list });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });

  const deleteMut = useMutation({
    mutationFn: api.savingsGoals.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings-goals'] }),
  });

  const totalSaved = goals.reduce((s, g) => s + (g.estimated_current ?? 0), 0);
  const totalTarget = goals.reduce((s, g) => s + (g.target_amount ?? 0), 0);
  const totalMonthly = goals.reduce((s, g) => s + (g.effective_monthly ?? 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Savings Goals</h2>
          <p className="text-slate-400 text-sm mt-1">Track progress towards your savings targets</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Add Goal
        </button>
      </div>

      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Total saved</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{fmt(totalSaved)}</p>
            <p className="text-xs text-slate-500 mt-1">of {fmt(totalTarget)} across {goals.length} goal{goals.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Still needed</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{fmt(totalTarget - totalSaved)}</p>
            <p className="text-xs text-slate-500 mt-1">{((totalSaved / totalTarget) * 100).toFixed(1)}% of all goals reached</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Contributing monthly</p>
            <p className="text-2xl font-bold text-indigo-400 mt-1">{fmt2(totalMonthly)}</p>
            <p className="text-xs text-slate-500 mt-1">{fmt(totalMonthly * 12)}/yr across all goals</p>
          </div>
        </div>
      )}

      {isLoading && <div className="text-slate-400">Loading...</div>}

      <div className="space-y-6">
        {goals.map(goal => (
          <GoalCard key={goal.id} goal={goal}
            onEdit={() => setModal(goal)}
            onDelete={() => { if (confirm(`Delete "${goal.name}"?`)) deleteMut.mutate(goal.id); }} />
        ))}
        {!isLoading && goals.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Target size={40} className="mx-auto mb-3 opacity-30" />
            <p>No savings goals yet. Add your first goal to start tracking.</p>
          </div>
        )}
      </div>

      {modal && (
        <GoalForm goal={modal === 'new' ? null : modal} expenses={expenses} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
