import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api.js';
import { TrendingUp, Receipt, Users, DollarSign, CalendarDays } from 'lucide-react';

const SCHEDULE_DAYS = { WEEKLY: 7, FORTNIGHTLY: 14, MONTHLY: null, QUARTERLY: null, ANNUALLY: null };

function getNextDueDate(expense) {
  if (!expense.is_active) return null;
  const schedule = expense.schedule;
  if (schedule === 'IRREGULAR' || schedule === 'ONCE') return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (schedule === 'WEEKLY' || schedule === 'FORTNIGHTLY') {
    const days = SCHEDULE_DAYS[schedule];
    const entries = expense.entries ?? [];
    if (entries.length) {
      const last = new Date(entries.sort((a, b) => b.date.localeCompare(a.date))[0].date);
      const next = new Date(last);
      next.setDate(next.getDate() + days);
      while (next < today) next.setDate(next.getDate() + days);
      return next;
    }
    return null;
  }

  // MONTHLY, QUARTERLY, ANNUALLY — find next occurrence this year/next
  const entries = expense.entries ?? [];
  if (entries.length) {
    const last = new Date(entries.sort((a, b) => b.date.localeCompare(a.date))[0].date);
    const monthsAhead = schedule === 'MONTHLY' ? 1 : schedule === 'QUARTERLY' ? 3 : 12;
    const next = new Date(last);
    next.setMonth(next.getMonth() + monthsAhead);
    while (next < today) next.setMonth(next.getMonth() + monthsAhead);
    return next;
  }
  return null;
}

function UpcomingBills({ expenses }) {
  const now = new Date();
  const in60Days = new Date(now);
  in60Days.setDate(in60Days.getDate() + 60);

  const upcoming = expenses
    .map(e => ({ ...e, nextDue: getNextDueDate(e) }))
    .filter(e => e.nextDue && e.nextDue <= in60Days)
    .sort((a, b) => a.nextDue - b.nextDue)
    .slice(0, 12);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  function dueLabel(date) {
    const diff = Math.round((date - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { label: 'Today', color: 'text-red-400' };
    if (diff === 1) return { label: 'Tomorrow', color: 'text-orange-400' };
    if (diff <= 7) return { label: `${diff}d`, color: 'text-amber-400' };
    if (diff <= 14) return { label: `${diff}d`, color: 'text-yellow-500' };
    return { label: date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), color: 'text-slate-400' };
  }

  if (upcoming.length === 0) return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={16} className="text-slate-400" />
        <h3 className="font-semibold">Upcoming Bills</h3>
      </div>
      <p className="text-slate-500 text-sm">No upcoming bills in the next 60 days.</p>
    </div>
  );

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-slate-400" />
          <h3 className="font-semibold">Upcoming Bills</h3>
        </div>
        <span className="text-xs text-slate-500">next 60 days</span>
      </div>
      <div className="space-y-2">
        {upcoming.map(e => {
          const { label, color } = dueLabel(e.nextDue);
          const amount = e.fixed_amount ?? 0;
          return (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <span className={`text-xs font-medium w-16 shrink-0 ${color}`}>{label}</span>
              <span className="text-sm flex-1 truncate">{e.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{e.schedule.charAt(0) + e.schedule.slice(1).toLowerCase()}</span>
              {amount > 0 && <span className="text-sm font-medium text-slate-300 shrink-0">{fmt2(amount)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '$0';
const fmt2 = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';

function StatCard({ icon: Icon, label, value, sub, color = 'text-indigo-400' }) {
  return (
    <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div className={`p-2 rounded-lg bg-slate-800 ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['summary'], queryFn: api.summary });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: api.expenses.list });

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>;
  if (error) return <div className="p-8 text-red-400">Error: {error.message}</div>;

  const { total, memberBreakdown, categoryBreakdown, expenseCount } = data;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1">Your household's financial overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={DollarSign}  label="Monthly Total"    value={fmt(total.monthly)}    sub={`${fmt(total.weekly)}/wk · ${fmt(total.fortnightly)}/fn`} color="text-emerald-400" />
        <StatCard icon={TrendingUp}  label="Annual Total"     value={fmt(total.annually)}   color="text-indigo-400" />
        <StatCard icon={Receipt}     label="Active Expenses"  value={expenseCount}          color="text-amber-400" />
        <StatCard icon={Users}       label="Members"          value={memberBreakdown.length} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Per-member breakdown */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-4">Per-Person Breakdown</h3>
          {memberBreakdown.length === 0 ? (
            <p className="text-slate-500 text-sm">No members yet — add some on the Members page.</p>
          ) : (
            <div className="space-y-3">
              {memberBreakdown.map(m => (
                <div key={m.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: m.color }} />
                      <span className="font-medium text-sm">{m.name}</span>
                    </div>
                    <span className="font-bold text-emerald-400">{fmt2(m.monthly)}<span className="text-slate-500 font-normal">/mo</span></span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pl-5">
                    <span>{fmt2(m.weekly)}/wk</span>
                    <span>{fmt2(m.fortnightly)}/fn</span>
                    <span>{fmt(m.annually)}/yr</span>
                  </div>
                  {/* Share bar */}
                  <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: total.monthly > 0 ? `${(m.monthly / total.monthly) * 100}%` : '0%',
                        background: m.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category breakdown pie */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-4">By Category</h3>
          {categoryBreakdown.length === 0 ? (
            <p className="text-slate-500 text-sm">No expenses yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={categoryBreakdown}
                  dataKey="monthly"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                >
                  {categoryBreakdown.map((cat, i) => (
                    <Cell key={i} fill={cat.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(val) => [fmt2(val), 'Monthly']}
                />
                <Legend
                  formatter={(val) => <span style={{ color: '#94a3b8', fontSize: '12px' }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Upcoming bills */}
      <div className="mb-6">
        <UpcomingBills expenses={expenses} />
      </div>

      {/* Category list */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-4">Category Details</h3>
          <div className="space-y-2">
            {categoryBreakdown.map((cat, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                <span className="text-sm flex-1">{cat.name}</span>
                <span className="text-sm text-slate-400">{fmt2(cat.monthly)}/mo</span>
                <span className="text-xs text-slate-600 w-12 text-right">
                  {total.monthly > 0 ? `${((cat.monthly / total.monthly) * 100).toFixed(0)}%` : '0%'}
                </span>
                <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${total.monthly > 0 ? (cat.monthly / total.monthly) * 100 : 0}%`, background: cat.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
