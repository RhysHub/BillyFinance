import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '../api.js';

const fmt = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }) ?? '$0';
const fmt2 = (n) => n?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) ?? '$0.00';

const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' };

export default function Reports() {
  const { data: projections, isLoading: projLoading } = useQuery({ queryKey: ['projections'], queryFn: () => api.projections(12) });
  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['summary'], queryFn: api.summary });

  const isLoading = projLoading || sumLoading;

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>;

  const { months = [], annualTotal = 0, memberBreakdown: projMembers = [] } = projections ?? {};
  const { categoryBreakdown = [], memberBreakdown = [], total = {} } = summary ?? {};

  // Per-member comparison data for bar chart
  const memberCompare = memberBreakdown.map(m => ({
    name: m.name,
    Monthly: parseFloat(m.monthly.toFixed(2)),
    Annual: parseFloat(m.annually.toFixed(2)),
    color: m.color,
  }));

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Reports & Projections</h2>
        <p className="text-slate-400 text-sm mt-1">Charts and forward-looking numbers</p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Monthly',      value: fmt2(total.monthly) },
          { label: 'Fortnightly',  value: fmt2(total.fortnightly) },
          { label: 'Weekly',       value: fmt2(total.weekly) },
          { label: 'Annual',       value: fmt(total.annually) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">{label}</p>
            <p className="text-xl font-bold text-indigo-400">{value}</p>
          </div>
        ))}
      </div>

      {/* 12-month projection */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">12-Month Projection</h3>
          <span className="text-sm text-slate-400">Annual total: <span className="text-emerald-400 font-semibold">{fmt(annualTotal)}</span></span>
        </div>
        {months.length === 0 ? (
          <p className="text-slate-500 text-sm">Add some expenses to see projections.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={months} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt2(v), 'Monthly Total']} />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} name="Monthly Total" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown pie */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-4">Spending by Category</h3>
          {categoryBreakdown.length === 0 ? (
            <p className="text-slate-500 text-sm">No expense data.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryBreakdown} dataKey="monthly" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                    {categoryBreakdown.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt2(v), 'Monthly']} />
                  <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: '12px' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {categoryBreakdown.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 text-slate-400">{c.name}</span>
                    <span className="font-medium">{fmt2(c.monthly)}/mo</span>
                    <span className="text-slate-500 text-xs w-10 text-right">
                      {total.monthly > 0 ? `${((c.monthly / total.monthly) * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Per-member comparison */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-4">Per-Person Comparison</h3>
          {memberBreakdown.length === 0 ? (
            <p className="text-slate-500 text-sm">Add members to see their share breakdown.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={memberCompare} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt2(v), 'Monthly']} />
                  <Bar dataKey="Monthly" radius={[4, 4, 0, 0]} name="Monthly">
                    {memberCompare.map((m, i) => <Cell key={i} fill={m.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Table */}
              <div className="mt-4 space-y-2">
                {memberBreakdown.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
                    <span className="flex-1 text-slate-400">{m.name}</span>
                    <span className="text-xs text-slate-500">{fmt2(m.weekly)}/wk</span>
                    <span className="font-medium">{fmt2(m.monthly)}/mo</span>
                    <span className="text-xs text-slate-500">{fmt(m.annually)}/yr</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
