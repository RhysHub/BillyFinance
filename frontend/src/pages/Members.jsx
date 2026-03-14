import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Users } from 'lucide-react';
import { api } from '../api.js';

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';

const COLOURS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#64748b',
];

function MemberForm({ member, onClose }) {
  const qc = useQueryClient();
  const isNew = !member;
  const [name, setName] = useState(member?.name ?? '');
  const [color, setColor] = useState(member?.color ?? COLOURS[0]);

  const mut = useMutation({
    mutationFn: (data) => isNew ? api.members.create(data) : api.members.update(member.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold">{isNew ? 'Add Member' : 'Edit Member'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate({ name, color }); }} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name *</label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rhys" required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLOURS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={mut.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm">
              {mut.isPending ? 'Saving...' : isNew ? 'Add Member' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Members() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const { data: members = [], isLoading } = useQuery({ queryKey: ['members'], queryFn: api.members.list });
  const { data: summary } = useQuery({ queryKey: ['summary'], queryFn: api.summary });

  const deleteMut = useMutation({
    mutationFn: api.members.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const memberBreakdown = summary?.memberBreakdown ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Members</h2>
          <p className="text-slate-400 text-sm mt-1">Your household members and their cost shares</p>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Member
        </button>
      </div>

      {isLoading && <div className="text-slate-400">Loading...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(m => {
          const breakdown = memberBreakdown.find(b => b.id === m.id);
          return (
            <div key={m.id} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: m.color + '33', color: m.color }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{m.name}</h3>
                    <p className="text-xs text-slate-500">Member</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(m)} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded"><Pencil size={15} /></button>
                  <button onClick={() => { if (confirm(`Remove ${m.name}?`)) deleteMut.mutate(m.id); }} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={15} /></button>
                </div>
              </div>

              {breakdown ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-400">Monthly</span>
                    <span className="font-bold text-lg" style={{ color: m.color }}>{fmt(breakdown.monthly)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div className="bg-slate-800 rounded-lg p-2">
                      <div className="text-slate-500">Weekly</div>
                      <div className="font-medium text-slate-200 mt-0.5">{fmt(breakdown.weekly)}</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-2">
                      <div className="text-slate-500">Fortnightly</div>
                      <div className="font-medium text-slate-200 mt-0.5">{fmt(breakdown.fortnightly)}</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-2 col-span-2">
                      <div className="text-slate-500">Annual</div>
                      <div className="font-medium text-slate-200 mt-0.5">{fmt(breakdown.annually)}</div>
                    </div>
                  </div>
                  {summary?.total?.monthly > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Share of total</span>
                        <span>{((breakdown.monthly / summary.total.monthly) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(breakdown.monthly / summary.total.monthly) * 100}%`, background: m.color }} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-600 text-sm">No expense data yet.</p>
              )}
            </div>
          );
        })}

        {!isLoading && members.length === 0 && (
          <div className="col-span-3 text-center py-16 text-slate-500">
            <p>No members yet. Add household members to split costs.</p>
          </div>
        )}
      </div>

      {modal && (
        <MemberForm
          member={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      <PaymentGroupsSection members={members} />
    </div>
  );
}

// ── Payment Groups ────────────────────────────────────────────────────────────

function GroupForm({ group, members, onClose }) {
  const qc = useQueryClient();
  const isNew = !group;
  const [name, setName] = useState(group?.name ?? '');

  const initialPct = {};
  const initialChecked = new Set();
  if (group?.members?.length) {
    group.members.forEach(m => {
      initialChecked.add(m.member_id);
      initialPct[m.member_id] = m.percentage;
    });
  }
  const [checked, setChecked] = useState(initialChecked);
  const [customPct, setCustomPct] = useState(initialPct);
  const [advancedMode, setAdvancedMode] = useState(group?.members?.some(m => {
    const equal = group.members.length > 0 ? 100 / group.members.length : 0;
    return Math.abs(m.percentage - equal) > 1;
  }) ?? false);

  const total = [...checked].reduce((s, id) => s + (parseFloat(customPct[id]) || 0), 0);

  function buildMembers() {
    if (!advancedMode) {
      const count = checked.size;
      if (!count) return [];
      const equal = parseFloat((100 / count).toFixed(4));
      return [...checked].map((id, i) => ({
        member_id: id,
        percentage: i === checked.size - 1 ? parseFloat((100 - equal * (count - 1)).toFixed(4)) : equal,
      }));
    }
    return [...checked].map(id => ({ member_id: id, percentage: parseFloat(customPct[id]) || 0 })).filter(m => m.percentage > 0);
  }

  const mut = useMutation({
    mutationFn: (data) => isNew ? api.paymentGroups.create(data) : api.paymentGroups.update(group.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paymentGroups'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="font-semibold">{isNew ? 'New Payment Group' : 'Edit Group'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mut.mutate({ name, members: buildMembers() }); }} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Group Name *</label>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Equal 3-way" required />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Members</label>
              <button type="button" onClick={() => setAdvancedMode(v => !v)} className="text-xs text-slate-500 hover:text-slate-300">
                {advancedMode ? '← Equal split' : 'Custom %'}
              </button>
            </div>
            <div className="space-y-2">
              {members.map(m => {
                const isChecked = checked.has(m.id);
                const equalShare = checked.size > 0 ? (100 / checked.size).toFixed(1) : '0';
                return (
                  <div key={m.id}
                    onClick={() => { const n = new Set(checked); n.has(m.id) ? n.delete(m.id) : n.add(m.id); setChecked(n); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-slate-800 border-slate-600' : 'bg-slate-900 border-slate-800 opacity-50'}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600'}`}>
                      {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                    <span className="text-sm flex-1">{m.name}</span>
                    {isChecked && (advancedMode ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input type="number" min="0" max="100" step="1"
                          className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-indigo-500"
                          value={customPct[m.id] ?? ''} onChange={e => setCustomPct(p => ({ ...p, [m.id]: e.target.value }))} />
                        <span className="text-slate-400 text-xs">%</span>
                      </div>
                    ) : <span className="text-xs text-slate-400">{equalShare}%</span>)}
                  </div>
                );
              })}
            </div>
            {advancedMode && (
              <p className={`mt-1.5 text-xs ${Math.abs(total - 100) > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
                Total: {total.toFixed(1)}% {Math.abs(total - 100) > 0.5 ? '— must equal 100%' : '✓'}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={mut.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm">
              {mut.isPending ? 'Saving...' : isNew ? 'Create Group' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignModal({ group, onClose }) {
  const qc = useQueryClient();
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });
  const [selected, setSelected] = useState(() => new Set(expenses.filter(e => e.payment_group_id === group.id).map(e => e.id)));

  const assignMut = useMutation({
    mutationFn: (ids) => api.paymentGroups.assign(group.id, ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
  });

  const SCHEDULE_SHORT = { WEEKLY: 'wk', FORTNIGHTLY: 'fn', MONTHLY: 'mo', QUARTERLY: 'qtr', ANNUALLY: 'yr', ONCE: 'once', IRREGULAR: 'irreg' };

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="font-semibold">Assign "{group.name}"</h2>
            <p className="text-xs text-slate-400 mt-0.5">Tick the expenses that should use this group's split</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
        </div>

        <div className="p-5">
          {/* Group preview */}
          <div className="flex gap-2 flex-wrap mb-4">
            {group.members?.map(m => (
              <span key={m.member_id} className="flex items-center gap-1.5 text-xs bg-slate-800 rounded-full px-2.5 py-1">
                <span className="w-2 h-2 rounded-full" style={{ background: m.member_color }} />
                {m.member_name} <span className="text-slate-500">{m.percentage}%</span>
              </span>
            ))}
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {expenses.length === 0 && <p className="text-slate-500 text-sm">No expenses yet.</p>}
            {expenses.map(exp => (
              <div
                key={exp.id}
                onClick={() => toggle(exp.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(exp.id) ? 'bg-slate-800 border-slate-600' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.has(exp.id) ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600'}`}>
                  {selected.has(exp.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: exp.category_color || '#6b7280' }} />
                <span className="text-sm flex-1">{exp.name}</span>
                <span className="text-xs text-slate-500">{SCHEDULE_SHORT[exp.schedule]}</span>
                {exp.payment_group_id && exp.payment_group_id !== group.id && (
                  <span className="text-xs text-amber-500">has group</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => assignMut.mutate([...selected])}
              disabled={assignMut.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm"
            >
              {assignMut.isPending ? 'Saving...' : `Assign to ${selected.size} expense${selected.size !== 1 ? 's' : ''}`}
            </button>
            <button onClick={onClose} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentGroupsSection({ members }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [assignGroup, setAssignGroup] = useState(null);
  const { data: groups = [] } = useQuery({ queryKey: ['paymentGroups'], queryFn: api.paymentGroups.list });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });
  const deleteMut = useMutation({
    mutationFn: api.paymentGroups.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['paymentGroups'] }),
  });

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold">Payment Groups</h3>
          <p className="text-slate-400 text-sm mt-0.5">Reusable split presets — update once, applies to all linked expenses</p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} /> New Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-10 text-slate-500 border border-slate-800 rounded-xl">
          <Users size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No groups yet. Create one to reuse split configs across expenses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map(g => (
            <div key={g.id} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium">{g.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => setAssignGroup(g)} className="p-1.5 text-slate-500 hover:text-emerald-400 rounded" title="Assign to expenses"><Users size={14} /></button>
                  <button onClick={() => setModal(g)} className="p-1.5 text-slate-500 hover:text-indigo-400 rounded"><Pencil size={14} /></button>
                  <button onClick={() => { if (confirm(`Delete "${g.name}"?`)) deleteMut.mutate(g.id); }} className="p-1.5 text-slate-500 hover:text-red-400 rounded"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {g.members?.map(m => (
                  <div key={m.member_id} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.member_color }} />
                    <span className="flex-1 text-slate-300">{m.member_name}</span>
                    <span className="text-slate-400">{m.percentage}%</span>
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${m.percentage}%`, background: m.member_color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <GroupForm
          group={modal === 'new' ? null : modal}
          members={members}
          onClose={() => setModal(null)}
        />
      )}
      {assignGroup && (
        <AssignModal
          group={assignGroup}
          onClose={() => setAssignGroup(null)}
        />
      )}
    </div>
  );
}
