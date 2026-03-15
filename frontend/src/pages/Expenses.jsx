import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, X, Check, Receipt, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../api.js';

const SCHEDULES = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONCE', 'IRREGULAR'];
const SCHEDULE_LABELS = { WEEKLY: 'Weekly', FORTNIGHTLY: 'Fortnightly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually', ONCE: 'One-time', IRREGULAR: 'Irregular (track transactions)' };

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';

function toMonthly(amount, schedule) {
  const WEEKS = { WEEKLY: 1, FORTNIGHTLY: 2, MONTHLY: 52 / 12, QUARTERLY: 13, ANNUALLY: 52, ONCE: 0 };
  if (schedule === 'ONCE' || schedule === 'IRREGULAR') return null;
  return (amount / WEEKS[schedule]) * WEEKS.MONTHLY;
}

function monthlyFromTransactions(entries = []) {
  if (!entries.length) return null;
  const byMonth = {};
  entries.forEach(e => {
    const month = (e.date || '').slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + e.amount;
  });
  const totals = Object.values(byMonth);
  return totals.reduce((s, v) => s + v, 0) / totals.length;
}

function ExpenseForm({ expense, onClose }) {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: api.categories.list });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: api.members.list });
  const { data: paymentGroups = [] } = useQuery({ queryKey: ['paymentGroups'], queryFn: api.paymentGroups.list });

  const isNew = !expense;
  const [form, setForm] = useState({
    name: expense?.name ?? '',
    description: expense?.description ?? '',
    category_id: expense?.category_id ?? '',
    schedule: expense?.schedule ?? 'MONTHLY',
    is_variable: expense?.is_variable ?? false,
    fixed_amount: expense?.fixed_amount ?? '',
    is_active: expense?.is_active ?? true,
  });

  // Split mode: 'simple' | 'group' | 'custom'
  const initialMode = expense?.payment_group_id ? 'group' : 'simple';
  const [splitMode, setSplitMode] = useState(initialMode);
  const [selectedGroupId, setSelectedGroupId] = useState(expense?.payment_group_id ?? '');

  // Who's included in the split (simple + custom modes)
  const initialChecked = new Set(
    expense?.splits?.length
      ? expense.splits.filter(s => s.percentage > 0).map(s => s.member_id)
      : members.map(m => m.id)
  );
  const [checked, setChecked] = useState(initialChecked);

  // Custom percentages only used in custom mode
  const initialCustom = {};
  if (expense?.splits?.length) {
    expense.splits.forEach(s => { initialCustom[s.member_id] = s.percentage; });
  }
  const [customPct, setCustomPct] = useState(initialCustom);

  // advancedMode alias for compat
  const advancedMode = splitMode === 'custom';

  // Derive the splits array to submit
  function buildSplits() {
    if (splitMode === 'group') return []; // handled via payment_group_id
    if (advancedMode) {
      return members
        .filter(m => checked.has(m.id))
        .map(m => ({ member_id: m.id, percentage: parseFloat(customPct[m.id]) || 0 }))
        .filter(s => s.percentage > 0);
    }
    const count = checked.size;
    if (!count) return [];
    const equal = parseFloat((100 / count).toFixed(4));
    return [...checked].map((id, i) => ({
      member_id: id,
      percentage: i === checked.size - 1
        ? parseFloat((100 - equal * (count - 1)).toFixed(4))
        : equal,
    }));
  }

  function toggleMember(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const advancedTotal = advancedMode
    ? [...checked].reduce((s, id) => s + (parseFloat(customPct[id]) || 0), 0)
    : 100;

  // Entries for variable expenses
  const [entries, setEntries] = useState(expense?.entries ?? []);
  const [newEntry, setNewEntry] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [addingEntry, setAddingEntry] = useState(false);


  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isNew) return api.expenses.create(data);
      return api.expenses.update(expense.id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
  });

  const addEntryMutation = useMutation({
    mutationFn: (data) => api.expenses.addEntry(expense.id, data),
    onSuccess: (entry) => {
      setEntries(prev => [entry, ...prev]);
      setNewEntry({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      setAddingEntry(false);
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId) => api.expenses.deleteEntry(expense.id, entryId),
    onSuccess: (_, entryId) => {
      setEntries(prev => prev.filter(e => e.id !== entryId));
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  function switchToAdvanced() {
    const splits = buildSplits();
    const map = {};
    splits.forEach(s => { map[s.member_id] = s.percentage; });
    setCustomPct(map);
    setSplitMode('custom');
  }

  const isIrregular = form.schedule === 'IRREGULAR';

  function handleSubmit(e) {
    e.preventDefault();
    if (!isIrregular && !form.is_variable && !form.fixed_amount) return;

    const splitsArray = buildSplits();

    saveMutation.mutate({
      ...form,
      is_variable: isIrregular ? true : form.is_variable,
      fixed_amount: (isIrregular || form.is_variable) ? null : parseFloat(form.fixed_amount),
      category_id: form.category_id || null,
      payment_group_id: splitMode === 'group' ? (selectedGroupId || null) : null,
      splits: splitsArray,
    });
  }

  // Compute average for variable
  const avgAmount = entries.length
    ? entries.reduce((s, e) => s + e.amount, 0) / entries.length
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget._closeOnUp = true; }} onMouseUp={(e) => { if (e.currentTarget._closeOnUp) { e.currentTarget._closeOnUp = false; onClose(); } }}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold text-lg">{isNew ? 'Add Expense' : 'Edit Expense'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name *</label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Electricity" required
            />
          </div>

          {/* Category + Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">— Uncategorised —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Schedule *</label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
              >
                {SCHEDULES.map(s => <option key={s} value={s}>{SCHEDULE_LABELS[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Amount type toggle — hidden for IRREGULAR */}
          {!isIrregular && (
            <div>
              <label className="block text-xs text-slate-400 mb-2">Amount Type</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-700">
                {[false, true].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_variable: v }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      form.is_variable === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {v ? 'Variable (averaged)' : 'Fixed amount'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fixed amount input */}
          {!isIrregular && !form.is_variable && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount ({SCHEDULE_LABELS[form.schedule]}) *</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400">$</span>
                <input
                  type="number" min="0" step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  value={form.fixed_amount} onChange={e => setForm(f => ({ ...f, fixed_amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Transaction / variable entries */}
          {(isIrregular || form.is_variable) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">
                  {isIrregular ? 'Transactions' : 'Bill History'}
                  {isIrregular && avgAmount !== null && (
                    <span className="ml-2 text-emerald-400">≈ {fmt(avgAmount)}/mo avg</span>
                  )}
                  {!isIrregular && avgAmount !== null && (
                    <span className="ml-2 text-emerald-400">avg {fmt(avgAmount)} / {SCHEDULE_LABELS[form.schedule].toLowerCase()}</span>
                  )}
                </label>
                {!isNew && (
                  <button type="button" onClick={() => setAddingEntry(true)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    <Plus size={12} /> {isIrregular ? 'Add transaction' : 'Add bill'}
                  </button>
                )}
                {isNew && <span className="text-xs text-slate-500">Save first, then add {isIrregular ? 'transactions' : 'bills'}</span>}
              </div>

              {addingEntry && (
                <div className="bg-slate-800 rounded-lg p-3 mb-2 flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">Amount</label>
                    <div className="relative mt-1">
                      <span className="absolute left-2 top-1.5 text-slate-400 text-sm">$</span>
                      <input type="number" min="0" step="0.01" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 pl-6 text-sm" value={newEntry.amount} onChange={e => setNewEntry(x => ({ ...x, amount: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400">Date</label>
                    <input type="date" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 mt-1 text-sm" value={newEntry.date} onChange={e => setNewEntry(x => ({ ...x, date: e.target.value }))} />
                  </div>
                  <button type="button" onClick={() => addEntryMutation.mutate(newEntry)} className="p-2 bg-indigo-600 rounded text-white hover:bg-indigo-500"><Check size={16} /></button>
                  <button type="button" onClick={() => setAddingEntry(false)} className="p-2 bg-slate-700 rounded text-slate-400 hover:text-slate-200"><X size={16} /></button>
                </div>
              )}

              {entries.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center justify-between bg-slate-800 rounded px-3 py-1.5 text-sm">
                      <span className="text-slate-400">{e.date?.slice(0, 10)}</span>
                      <span className="font-medium">{fmt(e.amount)}</span>
                      {e.notes && <span className="text-slate-500 text-xs flex-1 ml-2 truncate">{e.notes}</span>}
                      {!isNew && (
                        <button type="button" onClick={() => deleteEntryMutation.mutate(e.id)} className="ml-2 text-slate-600 hover:text-red-400"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600 text-xs">No bills entered yet.</p>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Any notes..."
            />
          </div>

          {/* Splits */}
          {members.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Who Pays</label>
              </div>

              {/* Mode tabs */}
              <div className="flex rounded-lg overflow-hidden border border-slate-700 mb-3 text-xs font-medium">
                {[['simple', 'Equal Split'], ['group', 'Groups'], ['custom', 'Custom %']].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (mode === 'custom') switchToAdvanced();
                      else setSplitMode(mode);
                    }}
                    className={`flex-1 py-2 transition-colors ${splitMode === mode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Group selector */}
              {splitMode === 'group' && (
                <div className="space-y-2">
                  <select
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                  >
                    <option value="">— Select a payment group —</option>
                    {paymentGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {selectedGroupId && (() => {
                    const g = paymentGroups.find(g => g.id === selectedGroupId);
                    return g?.members?.length ? (
                      <div className="flex gap-2 flex-wrap pt-1">
                        {g.members.map(m => (
                          <span key={m.member_id} className="flex items-center gap-1.5 text-xs bg-slate-800 rounded-full px-2.5 py-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: m.member_color }} />
                            {m.member_name} <span className="text-slate-500">{m.percentage}%</span>
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {paymentGroups.length === 0 && (
                    <p className="text-xs text-slate-500">No groups yet — create them on the Members page.</p>
                  )}
                </div>
              )}

              {/* Simple / Custom member list */}
              {splitMode !== 'group' && (
              <div className="space-y-2">
                {members.map(m => {
                  const isChecked = checked.has(m.id);
                  const equalShare = checked.size > 0 ? (100 / checked.size).toFixed(1) : '0';
                  return (
                    <div
                      key={m.id}
                      onClick={() => !advancedMode && toggleMember(m.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                        isChecked
                          ? 'bg-slate-800 border-slate-600 cursor-pointer'
                          : 'bg-slate-900 border-slate-800 opacity-50 cursor-pointer'
                      } ${advancedMode ? 'cursor-default' : ''}`}
                    >
                      {/* Checkbox */}
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleMember(m.id); }}
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border cursor-pointer transition-colors ${
                          isChecked ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600 bg-slate-900'
                        }`}
                      >
                        {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>

                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                      <span className="text-sm flex-1">{m.name}</span>

                      {isChecked && (
                        advancedMode ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min="0" max="100" step="1"
                              className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-indigo-500"
                              value={customPct[m.id] ?? ''}
                              onChange={e => setCustomPct(p => ({ ...p, [m.id]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="text-slate-400 text-sm">%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{equalShare}%</span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
              )}

              {advancedMode && (
                <div className={`mt-2 text-xs ${Math.abs(advancedTotal - 100) > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
                  Total: {advancedTotal.toFixed(1)}% {Math.abs(advancedTotal - 100) > 0.5 ? '— must equal 100%' : '✓'}
                </div>
              )}

              {/* "Select all" shortcut for simple mode */}
              {splitMode === 'simple' && (
                <button type="button" onClick={() => setChecked(new Set(members.map(m => m.id)))} className="mt-2 text-xs text-slate-500 hover:text-slate-300">
                  Select all
                </button>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {saveMutation.isPending ? 'Saving...' : isNew ? 'Add Expense' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Expenses() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | 'new' | expense object
  const [expanded, setExpanded] = useState(null);

  const { data: expenses = [], isLoading } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });
  const { data: paymentGroups = [] } = useQuery({ queryKey: ['paymentGroups'], queryFn: api.paymentGroups.list });

  const deleteMutation = useMutation({
    mutationFn: api.expenses.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (exp) => api.expenses.update(exp.id, { ...exp, is_active: !exp.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  function handleDelete(expense) {
    if (confirm(`Delete "${expense.name}"?`)) deleteMutation.mutate(expense.id);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Expenses</h2>
          <p className="text-slate-400 text-sm mt-1">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {isLoading && <div className="text-slate-400">Loading...</div>}

      <div className="space-y-2">
        {expenses.map(exp => {
          const isIrreg = exp.schedule === 'IRREGULAR';
          const monthly = isIrreg
            ? monthlyFromTransactions(exp.entries)
            : exp.is_variable && exp.entries?.length
              ? toMonthly(exp.entries.reduce((s, e) => s + e.amount, 0) / exp.entries.length, exp.schedule)
              : exp.fixed_amount !== null ? toMonthly(exp.fixed_amount, exp.schedule) : null;
          const displayAmount = isIrreg ? monthly : (exp.is_variable ? (exp.entries?.length ? exp.entries.reduce((s, e) => s + e.amount, 0) / exp.entries.length : null) : exp.fixed_amount);
          const isExp = expanded === exp.id;

          // For IRREGULAR: build month-by-month breakdown
          const monthBreakdown = isIrreg && exp.entries?.length ? (() => {
            const byMonth = {};
            exp.entries.forEach(e => {
              const m = (e.date || '').slice(0, 7);
              if (m) byMonth[m] = (byMonth[m] || 0) + e.amount;
            });
            return Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
          })() : [];

          return (
            <div key={exp.id} className={`bg-slate-900 rounded-xl border transition-colors ${exp.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}>
              <div className="flex items-center gap-3 p-4">
                {/* Category colour dot */}
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: exp.category_color || '#6b7280' }} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{exp.name}</span>
                    {exp.category_name && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{exp.category_icon} {exp.category_name}</span>
                    )}
                    {isIrreg
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-400">irregular</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">{SCHEDULE_LABELS[exp.schedule]}</span>
                    }
                    {exp.is_variable && !isIrreg && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">variable</span>}
                    {!exp.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">inactive</span>}
                  </div>
                  {exp.payment_group_id ? (() => {
                    const g = paymentGroups.find(g => g.id === exp.payment_group_id);
                    return g ? (
                      <div className="flex gap-1 mt-1 flex-wrap items-center">
                        <span className="text-xs text-indigo-400 mr-0.5">{g.name}:</span>
                        {g.members?.map(m => (
                          <span key={m.member_id} className="text-xs text-slate-500">
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: m.member_color }} />
                            {m.member_name} {m.percentage}%
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })() : exp.splits?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {exp.splits.map(s => (
                        <span key={s.id} className="text-xs text-slate-500">
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: s.member_color }} />
                          {s.member_name} {s.percentage}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  {isIrreg ? (
                    monthly !== null
                      ? <div className="font-semibold text-sm text-emerald-400">{fmt(monthly)}<span className="text-slate-500 font-normal text-xs ml-1">/mo avg</span></div>
                      : <span className="text-slate-500 text-xs">no transactions</span>
                  ) : displayAmount !== null ? (
                    <>
                      <div className="font-semibold text-sm">{fmt(displayAmount)}<span className="text-slate-500 font-normal text-xs ml-1">{exp.is_variable ? 'avg' : ''}/{SCHEDULE_LABELS[exp.schedule].toLowerCase()}</span></div>
                      {monthly !== null && <div className="text-xs text-emerald-400">{fmt(monthly)}/mo</div>}
                    </>
                  ) : (
                    <span className="text-slate-500 text-xs">no data</span>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActiveMutation.mutate(exp)}
                    title={exp.is_active ? 'Mark inactive' : 'Mark active'}
                    className={`p-1.5 rounded ${exp.is_active ? 'text-slate-500 hover:text-amber-400' : 'text-amber-400 hover:text-emerald-400'}`}
                  >
                    {exp.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => setExpanded(isExp ? null : exp.id)} className="p-1.5 text-slate-500 hover:text-slate-300 rounded">
                    {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => setModal(exp)} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(exp)} className="p-1.5 text-slate-500 hover:text-red-400 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {isExp && (
                <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-3">
                  {exp.description && <p className="text-sm text-slate-400">{exp.description}</p>}

                  {/* IRREGULAR: month-by-month breakdown */}
                  {isIrreg && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">
                        Monthly breakdown ({exp.entries?.length ?? 0} transactions across {monthBreakdown.length} month{monthBreakdown.length !== 1 ? 's' : ''})
                      </p>
                      {monthBreakdown.length > 0 ? (
                        <div className="space-y-1">
                          {monthBreakdown.map(([month, total]) => (
                            <div key={month} className="flex items-center gap-3 text-sm">
                              <span className="text-slate-400 w-16">{month}</span>
                              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full"
                                  style={{ width: `${(total / Math.max(...monthBreakdown.map(([,v]) => v))) * 100}%` }}
                                />
                              </div>
                              <span className="font-medium w-20 text-right">{fmt(total)}</span>
                            </div>
                          ))}
                          {monthly !== null && (
                            <div className="flex items-center gap-3 text-sm pt-1 border-t border-slate-800 mt-1">
                              <span className="text-slate-500 w-16">avg</span>
                              <div className="flex-1" />
                              <span className="text-emerald-400 font-semibold w-20 text-right">{fmt(monthly)}/mo</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-slate-600 text-xs">No transactions yet. Edit to add some.</p>
                      )}
                    </div>
                  )}

                  {/* Variable bills: original flat list */}
                  {exp.is_variable && !isIrreg && exp.entries?.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Bill history ({exp.entries.length} entries):</p>
                      <div className="flex gap-2 flex-wrap">
                        {exp.entries.slice(0, 8).map(e => (
                          <span key={e.id} className="text-xs bg-slate-800 rounded px-2 py-1 text-slate-300">{e.date?.slice(0, 10)} — {fmt(e.amount)}</span>
                        ))}
                        {exp.entries.length > 8 && <span className="text-xs text-slate-500">+{exp.entries.length - 8} more</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && expenses.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Receipt size={40} className="mx-auto mb-3 opacity-30" />
            <p>No expenses yet. Add your first one!</p>
          </div>
        )}
      </div>

      {modal && (
        <ExpenseForm
          expense={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
