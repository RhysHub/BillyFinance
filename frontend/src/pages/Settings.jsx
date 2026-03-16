import { useRef, useState, useEffect } from 'react';
import { Download, Upload, CheckCircle, AlertCircle, Eye, EyeOff, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { api, KEY_STORAGE } from '../api.js';

function ApiKeySection() {
  const [keyInfo, setKeyInfo] = useState(null); // { api_key, source }
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.settings.get().then(info => {
      setKeyInfo(info);
      // Sync localStorage with server key on load
      if (info.api_key) localStorage.setItem(KEY_STORAGE, info.api_key);
      else localStorage.removeItem(KEY_STORAGE);
    }).catch(() => {});
  }, []);

  function generateKey() {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    return key;
  }

  async function handleSet(key) {
    setSaving(true);
    setError(null);
    try {
      await api.settings.setApiKey(key);
      localStorage.setItem(KEY_STORAGE, key);
      setKeyInfo({ api_key: key, source: 'db' });
      setShowKey(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm('Remove the API key? All external automation will stop working.')) return;
    await api.settings.deleteApiKey();
    localStorage.removeItem(KEY_STORAGE);
    setKeyInfo({ api_key: null, source: 'none' });
    setShowKey(false);
  }

  function handleCopy() {
    if (!keyInfo?.api_key) return;
    navigator.clipboard.writeText(keyInfo.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isEnv = keyInfo?.source === 'env';
  const hasKey = !!keyInfo?.api_key;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h3 className="font-semibold mb-1">API Key</h3>
      <p className="text-sm text-slate-400 mb-4">
        Used to authenticate external automation — e.g. posting new bills via <code className="text-indigo-400">POST /api/expenses/log</code>. Pass as <code className="text-indigo-400">Authorization: Bearer &lt;key&gt;</code>.
        {isEnv && <span className="ml-1 text-amber-400">Key is set via environment variable and cannot be changed here.</span>}
      </p>

      {hasKey ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <code className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono break-all">
              {showKey ? keyInfo.api_key : '••••••••••••••••••••••••••••••••••••••••••••••••'}
            </code>
            <button onClick={() => setShowKey(v => !v)} className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 rounded-lg">
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={handleCopy} className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700 rounded-lg">
              {copied ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
            </button>
          </div>
          {!isEnv && (
            <div className="flex gap-2">
              <button
                onClick={() => handleSet(generateKey())}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg"
              >
                <RefreshCw size={14} /> Regenerate
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Send as <code className="text-slate-400">Authorization: Bearer {showKey ? keyInfo.api_key : '...'}</code> header in external requests.
          </p>
        </div>
      ) : (
        <button
          onClick={() => handleSet(generateKey())}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <RefreshCw size={15} /> {saving ? 'Generating...' : 'Generate API Key'}
        </button>
      )}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}
    </div>
  );
}

const ENDPOINTS = [
  // ── Health ─────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/health',
    tag: 'data',
    summary: 'Health check',
    desc: 'Returns server status. Use this to verify the API is reachable and test your Bearer token.',
    response: '{ status: "ok", version: "1.0.0" }',
    example: `curl http://your-host/api/health \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Automation ────────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/expenses/log',
    tag: 'automation',
    summary: 'Log a bill entry by expense name',
    desc: 'The main automation endpoint. Finds an expense by name and adds a bill entry to it. Exact name match first, then partial. If no match, returns the list of available expense names.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Expense name (e.g. "Power", "Groceries")' },
      { name: 'amount', type: 'number', required: true, desc: 'Bill amount in dollars (e.g. 187.50)' },
      { name: 'date', type: 'string', required: true, desc: 'Date in YYYY-MM-DD format' },
      { name: 'notes', type: 'string', required: false, desc: 'Optional note (e.g. "AGL March bill")' },
    ],
    response: '{ expense_id, expense_name, entry: { id, expense_id, amount, date, notes, created_at } }',
    example: `curl -X POST http://your-host/api/expenses/log \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Power","amount":187.50,"date":"2026-03-15","notes":"AGL March"}'`,
  },

  // ── Expenses ───────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/expenses',
    tag: 'expenses',
    summary: 'List all expenses',
    desc: 'Returns all expenses with their bill entries, member splits, and category info. Optionally filter by name.',
    query: [
      { name: 'q', type: 'string', required: false, desc: 'Filter by name (case-insensitive partial match)' },
    ],
    response: 'Array of expense objects with entries[], splits[], category_name, category_color, category_icon',
    example: `curl http://your-host/api/expenses?q=power \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/expenses',
    tag: 'expenses',
    summary: 'Create a new expense',
    desc: 'Creates a new recurring expense. For variable/irregular expenses set is_variable or use IRREGULAR schedule.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Expense name' },
      { name: 'schedule', type: 'string', required: true, desc: 'WEEKLY · FORTNIGHTLY · MONTHLY · QUARTERLY · ANNUALLY · ONCE · IRREGULAR' },
      { name: 'fixed_amount', type: 'number', required: false, desc: 'Amount per period (omit for variable/irregular)' },
      { name: 'is_variable', type: 'boolean', required: false, desc: 'True if amount varies — bill entries are averaged' },
      { name: 'category_id', type: 'string', required: false, desc: 'Category ID (get from GET /api/categories)' },
      { name: 'payment_group_id', type: 'string', required: false, desc: 'Payment group ID for splits' },
      { name: 'description', type: 'string', required: false, desc: 'Notes' },
      { name: 'splits', type: 'array', required: false, desc: '[{ member_id, percentage }] — manual splits (ignored if payment_group_id set)' },
    ],
    response: 'Full expense object',
    example: `curl -X POST http://your-host/api/expenses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Electricity","schedule":"QUARTERLY","fixed_amount":320,"category_id":"..."}'`,
  },
  {
    method: 'PUT',
    path: '/api/expenses/:id',
    tag: 'expenses',
    summary: 'Update an expense',
    desc: 'Updates an existing expense. All fields are replaced — include the full object. Pass is_active: false to deactivate.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Expense name' },
      { name: 'schedule', type: 'string', required: true, desc: 'WEEKLY · FORTNIGHTLY · MONTHLY · QUARTERLY · ANNUALLY · ONCE · IRREGULAR' },
      { name: 'fixed_amount', type: 'number', required: false, desc: 'Amount per period' },
      { name: 'is_variable', type: 'boolean', required: false, desc: 'True if amount varies' },
      { name: 'is_active', type: 'boolean', required: false, desc: 'false to deactivate (excluded from totals)' },
      { name: 'category_id', type: 'string', required: false, desc: 'Category ID' },
      { name: 'payment_group_id', type: 'string', required: false, desc: 'Payment group ID' },
      { name: 'splits', type: 'array', required: false, desc: '[{ member_id, percentage }] — replaces existing splits' },
    ],
    response: 'Updated expense object',
    example: `curl -X PUT http://your-host/api/expenses/abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Electricity","schedule":"QUARTERLY","fixed_amount":350,"is_active":true}'`,
  },
  {
    method: 'DELETE',
    path: '/api/expenses/:id',
    tag: 'expenses',
    summary: 'Delete an expense',
    desc: 'Permanently deletes an expense and all its bill entries.',
    response: '{ ok: true }',
    example: `curl -X DELETE http://your-host/api/expenses/abc123 \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/expenses/:id/entries',
    tag: 'expenses',
    summary: 'Add a bill entry by expense ID',
    desc: 'Adds a bill entry to a variable or irregular expense. Use POST /api/expenses/log if you only know the name.',
    body: [
      { name: 'amount', type: 'number', required: true, desc: 'Bill amount' },
      { name: 'date', type: 'string', required: true, desc: 'Date in YYYY-MM-DD format' },
      { name: 'notes', type: 'string', required: false, desc: 'Optional note' },
    ],
    response: 'Created bill entry object',
    example: `curl -X POST http://your-host/api/expenses/abc123/entries \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"amount":94.20,"date":"2026-03-10"}'`,
  },
  {
    method: 'DELETE',
    path: '/api/expenses/:id/entries/:entryId',
    tag: 'expenses',
    summary: 'Delete a bill entry',
    desc: 'Removes a specific bill entry from an expense.',
    response: '{ ok: true }',
    example: `curl -X DELETE http://your-host/api/expenses/abc123/entries/entry456 \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Loans ──────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/loans',
    tag: 'loans',
    summary: 'List all loans',
    desc: 'Returns all loans enriched with computed current_balance (projected from balance_date using linked expenses), effective_monthly, and effective_extra payment amounts.',
    response: '[{ id, name, balance, balance_date, initial_balance, start_date, loan_term_years, interest_rate, monthly_payment, extra_payment, monthly_expense_id, extra_expense_id, notes, current_balance, effective_monthly, effective_extra, linked_expense_ids[] }]',
    example: `curl http://your-host/api/loans \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/loans',
    tag: 'loans',
    summary: 'Create a loan',
    desc: 'Creates a new loan. Link a monthly repayment expense via monthly_expense_id to have the balance auto-updated from actual payment entries.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Loan name (e.g. "Home Loan")' },
      { name: 'balance', type: 'number', required: true, desc: 'Current outstanding balance' },
      { name: 'interest_rate', type: 'number', required: true, desc: 'Annual interest rate as a percentage (e.g. 6.14)' },
      { name: 'balance_date', type: 'string', required: false, desc: 'Date the balance was recorded (YYYY-MM-DD) — used to project current balance' },
      { name: 'initial_balance', type: 'number', required: false, desc: 'Original loan amount at start' },
      { name: 'start_date', type: 'string', required: false, desc: 'Loan start date (YYYY-MM-DD)' },
      { name: 'loan_term_years', type: 'number', required: false, desc: 'Original loan term in years' },
      { name: 'monthly_payment', type: 'number', required: false, desc: 'Manual minimum monthly repayment (overridden by monthly_expense_id)' },
      { name: 'extra_payment', type: 'number', required: false, desc: 'Manual extra monthly repayment (overridden by extra_expense_id)' },
      { name: 'monthly_expense_id', type: 'string', required: false, desc: 'Expense ID whose amount is used as the minimum monthly repayment' },
      { name: 'extra_expense_id', type: 'string', required: false, desc: 'Expense ID whose amount is used as the extra monthly repayment' },
      { name: 'linked_expense_ids', type: 'array', required: false, desc: '[expense_id, ...] — additional expenses counted toward repayments' },
      { name: 'notes', type: 'string', required: false, desc: 'Optional notes' },
    ],
    response: 'Enriched loan object',
    example: `curl -X POST http://your-host/api/loans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Home Loan","balance":420000,"interest_rate":6.14,"balance_date":"2026-01-01","initial_balance":500000,"start_date":"2020-06-01","loan_term_years":30}'`,
  },
  {
    method: 'PUT',
    path: '/api/loans/:id',
    tag: 'loans',
    summary: 'Update a loan',
    desc: 'Updates a loan. Same fields as POST. linked_expense_ids replaces the existing set.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Loan name' },
      { name: 'balance', type: 'number', required: true, desc: 'Current outstanding balance' },
      { name: 'interest_rate', type: 'number', required: true, desc: 'Annual interest rate (%)' },
      { name: 'balance_date', type: 'string', required: false, desc: 'Date the balance was recorded (YYYY-MM-DD)' },
      { name: 'initial_balance', type: 'number', required: false, desc: 'Original loan amount' },
      { name: 'start_date', type: 'string', required: false, desc: 'Loan start date' },
      { name: 'loan_term_years', type: 'number', required: false, desc: 'Original term in years' },
      { name: 'monthly_payment', type: 'number', required: false, desc: 'Manual minimum monthly repayment' },
      { name: 'extra_payment', type: 'number', required: false, desc: 'Manual extra monthly repayment' },
      { name: 'monthly_expense_id', type: 'string', required: false, desc: 'Linked minimum repayment expense' },
      { name: 'extra_expense_id', type: 'string', required: false, desc: 'Linked extra repayment expense' },
      { name: 'linked_expense_ids', type: 'array', required: false, desc: 'Replaces all linked expenses' },
    ],
    response: 'Enriched loan object',
    example: `curl -X PUT http://your-host/api/loans/abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Home Loan","balance":415000,"interest_rate":6.14}'`,
  },
  {
    method: 'DELETE',
    path: '/api/loans/:id',
    tag: 'loans',
    summary: 'Delete a loan',
    desc: 'Permanently deletes a loan.',
    response: '{ ok: true }',
    example: `curl -X DELETE http://your-host/api/loans/abc123 \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Savings Goals ──────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/savings-goals',
    tag: 'savings',
    summary: 'List all savings goals',
    desc: 'Returns all goals enriched with estimated_current (projected from current_amount_date + contributions), remaining, months_to_goal, and progress_pct.',
    response: '[{ id, name, target_amount, current_amount, current_amount_date, monthly_contribution, contribution_schedule, contribution_expense_id, color, notes, effective_monthly, estimated_current, remaining, months_to_goal, progress_pct }]',
    example: `curl http://your-host/api/savings-goals \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/savings-goals',
    tag: 'savings',
    summary: 'Create a savings goal',
    desc: 'Creates a new savings goal. Optionally link a contribution_expense_id to pull the contribution amount from an existing expense.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Goal name (e.g. "Emergency Fund")' },
      { name: 'target_amount', type: 'number', required: true, desc: 'Target savings amount' },
      { name: 'current_amount', type: 'number', required: false, desc: 'Current balance (default 0)' },
      { name: 'current_amount_date', type: 'string', required: false, desc: 'Date the current_amount was recorded (YYYY-MM-DD) — used to project forward' },
      { name: 'monthly_contribution', type: 'number', required: false, desc: 'Amount contributed per period (default 0)' },
      { name: 'contribution_schedule', type: 'string', required: false, desc: 'DAILY · WEEKLY · FORTNIGHTLY · MONTHLY · QUARTERLY · ANNUALLY (default MONTHLY)' },
      { name: 'contribution_expense_id', type: 'string', required: false, desc: 'Expense ID to pull contribution amount from (overrides monthly_contribution)' },
      { name: 'color', type: 'string', required: false, desc: 'Hex color (default #6366f1)' },
      { name: 'notes', type: 'string', required: false, desc: 'Optional notes' },
    ],
    response: 'Enriched savings goal object',
    example: `curl -X POST http://your-host/api/savings-goals \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Emergency Fund","target_amount":20000,"current_amount":5000,"current_amount_date":"2026-03-01","monthly_contribution":500,"contribution_schedule":"MONTHLY"}'`,
  },
  {
    method: 'PUT',
    path: '/api/savings-goals/:id',
    tag: 'savings',
    summary: 'Update a savings goal',
    desc: 'Updates a savings goal. All fields replaced — include the full object.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Goal name' },
      { name: 'target_amount', type: 'number', required: true, desc: 'Target savings amount' },
      { name: 'current_amount', type: 'number', required: false, desc: 'Current balance' },
      { name: 'current_amount_date', type: 'string', required: false, desc: 'Date of current_amount (YYYY-MM-DD)' },
      { name: 'monthly_contribution', type: 'number', required: false, desc: 'Amount per contribution period' },
      { name: 'contribution_schedule', type: 'string', required: false, desc: 'DAILY · WEEKLY · FORTNIGHTLY · MONTHLY · QUARTERLY · ANNUALLY' },
      { name: 'contribution_expense_id', type: 'string', required: false, desc: 'Linked expense for contribution amount' },
      { name: 'color', type: 'string', required: false, desc: 'Hex color' },
    ],
    response: 'Enriched savings goal object',
    example: `curl -X PUT http://your-host/api/savings-goals/abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Emergency Fund","target_amount":20000,"current_amount":7500,"current_amount_date":"2026-03-16","monthly_contribution":500,"contribution_schedule":"MONTHLY"}'`,
  },
  {
    method: 'DELETE',
    path: '/api/savings-goals/:id',
    tag: 'savings',
    summary: 'Delete a savings goal',
    desc: 'Permanently deletes a savings goal.',
    response: '{ ok: true }',
    example: `curl -X DELETE http://your-host/api/savings-goals/abc123 \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Members ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/members',
    tag: 'data',
    summary: 'List members',
    desc: 'Returns all household members including income fields. Use member IDs when creating expenses with custom splits.',
    response: '[{ id, name, color, income_amount, income_schedule, created_at }]',
    example: `curl http://your-host/api/members \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/members',
    tag: 'data',
    summary: 'Create a member',
    desc: 'Adds a new household member. Optionally include income to enable per-member expense-as-%-of-income calculations.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Member name' },
      { name: 'color', type: 'string', required: false, desc: 'Hex color (default #6366f1)' },
      { name: 'income_amount', type: 'number', required: false, desc: 'Income amount per income_schedule period' },
      { name: 'income_schedule', type: 'string', required: false, desc: 'WEEKLY · FORTNIGHTLY · MONTHLY · ANNUALLY (default MONTHLY)' },
    ],
    response: 'Member object',
    example: `curl -X POST http://your-host/api/members \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Alex","color":"#10b981","income_amount":6500,"income_schedule":"MONTHLY"}'`,
  },
  {
    method: 'PUT',
    path: '/api/members/:id',
    tag: 'data',
    summary: 'Update a member',
    desc: 'Updates a member\'s name, color, and income.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Member name' },
      { name: 'color', type: 'string', required: true, desc: 'Hex color' },
      { name: 'income_amount', type: 'number', required: false, desc: 'Income amount per period' },
      { name: 'income_schedule', type: 'string', required: false, desc: 'WEEKLY · FORTNIGHTLY · MONTHLY · ANNUALLY' },
    ],
    response: 'Updated member object',
    example: `curl -X PUT http://your-host/api/members/abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Alex","color":"#10b981","income_amount":7000,"income_schedule":"MONTHLY"}'`,
  },
  {
    method: 'DELETE',
    path: '/api/members/:id',
    tag: 'data',
    summary: 'Delete a member',
    desc: 'Permanently deletes a member. Expense splits referencing this member are also deleted.',
    response: '{ ok: true }',
    example: `curl -X DELETE http://your-host/api/members/abc123 \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Categories ─────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/categories',
    tag: 'data',
    summary: 'List categories',
    desc: 'Returns all expense categories. Use category IDs when creating or updating expenses.',
    response: '[{ id, name, color, icon }]',
    example: `curl http://your-host/api/categories \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/categories',
    tag: 'data',
    summary: 'Create a category',
    desc: 'Creates a new expense category. Names must be unique.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Category name (must be unique)' },
      { name: 'color', type: 'string', required: false, desc: 'Hex color (default #6b7280)' },
      { name: 'icon', type: 'string', required: false, desc: 'Emoji icon (default 📦)' },
    ],
    response: 'Category object',
    example: `curl -X POST http://your-host/api/categories \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Pet","color":"#f97316","icon":"🐾"}'`,
  },
  {
    method: 'PUT',
    path: '/api/categories/:id',
    tag: 'data',
    summary: 'Update a category',
    desc: 'Updates a category name, color, and icon.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Category name' },
      { name: 'color', type: 'string', required: true, desc: 'Hex color' },
      { name: 'icon', type: 'string', required: true, desc: 'Emoji icon' },
    ],
    response: 'Updated category object',
    example: `curl -X PUT http://your-host/api/categories/abc123 \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"Pets","color":"#f97316","icon":"🐾"}'`,
  },

  // ── Summary & Projections ──────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/summary',
    tag: 'data',
    summary: 'Get cost summary',
    desc: 'Returns total weekly/fortnightly/monthly/annual costs, per-member breakdown, and category breakdown for all active expenses.',
    response: '{ total: { weekly, fortnightly, monthly, annually }, memberBreakdown: [{ id, name, color, weekly, fortnightly, monthly, annually }], categoryBreakdown: [{ name, color, monthly }], expenseCount }',
    example: `curl http://your-host/api/summary \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'GET',
    path: '/api/projections',
    tag: 'data',
    summary: 'Get monthly cost projections',
    desc: 'Returns a month-by-month projection of total expenses. Useful for building charts or forecasting.',
    query: [
      { name: 'months', type: 'number', required: false, desc: 'Number of months to project (default 12)' },
    ],
    response: '{ months: [{ month, label, total, perMember: [{ id, name, color, amount }] }], annualTotal, memberBreakdown }',
    example: `curl "http://your-host/api/projections?months=24" \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },

  // ── Payment Groups ─────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/payment-groups',
    tag: 'data',
    summary: 'List payment groups',
    desc: 'Returns all payment groups with their member split percentages. Assign a group to expenses to split costs automatically.',
    response: '[{ id, name, members: [{ member_id, member_name, member_color, percentage }] }]',
    example: `curl http://your-host/api/payment-groups \\
  -H "Authorization: Bearer YOUR_KEY"`,
  },
  {
    method: 'POST',
    path: '/api/payment-groups',
    tag: 'data',
    summary: 'Create a payment group',
    desc: 'Creates a named group of members with percentage splits. Assign to expenses via payment_group_id.',
    body: [
      { name: 'name', type: 'string', required: true, desc: 'Group name (must be unique)' },
      { name: 'members', type: 'array', required: false, desc: '[{ member_id, percentage }] — percentages should sum to 100' },
    ],
    response: 'Payment group object with members[]',
    example: `curl -X POST http://your-host/api/payment-groups \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"name":"50/50","members":[{"member_id":"id1","percentage":50},{"member_id":"id2","percentage":50}]}'`,
  },
  {
    method: 'POST',
    path: '/api/payment-groups/:id/assign',
    tag: 'data',
    summary: 'Bulk-assign group to expenses',
    desc: 'Sets this payment group on a list of expenses, replacing any previous group assignment. Clears the group from any expenses not in the list.',
    body: [
      { name: 'expense_ids', type: 'array', required: true, desc: '[expense_id, ...] — expenses to assign this group to' },
    ],
    response: '{ ok: true, assigned: N }',
    example: `curl -X POST http://your-host/api/payment-groups/grp123/assign \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -d '{"expense_ids":["exp1","exp2","exp3"]}'`,
  },
];

const METHOD_COLORS = {
  GET:    'bg-emerald-900/50 text-emerald-400',
  POST:   'bg-indigo-900/50 text-indigo-400',
  PUT:    'bg-amber-900/50 text-amber-400',
  DELETE: 'bg-red-900/50 text-red-400',
};

function EndpointRow({ ep }) {
  const [open, setOpen] = useState(false);
  const [copiedEx, setCopiedEx] = useState(false);

  function copyExample() {
    navigator.clipboard.writeText(ep.example);
    setCopiedEx(true);
    setTimeout(() => setCopiedEx(false), 2000);
  }

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/80 transition-colors text-left"
      >
        <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
        <code className="text-sm text-slate-200 flex-1">{ep.path}</code>
        <span className="text-xs text-slate-500 hidden sm:block">{ep.summary}</span>
        <span className="text-slate-500 ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-slate-950 space-y-4 border-t border-slate-800">
          <p className="text-sm text-slate-300">{ep.desc}</p>

          {ep.query?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Query params</p>
              <div className="space-y-1">
                {ep.query.map(p => (
                  <div key={p.name} className="flex gap-3 text-sm">
                    <code className="text-indigo-400 w-24 flex-shrink-0">{p.name}</code>
                    <span className="text-slate-500 w-16 flex-shrink-0">{p.type}</span>
                    <span className="text-slate-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ep.body?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Request body (JSON)</p>
              <div className="space-y-1.5">
                {ep.body.map(p => (
                  <div key={p.name} className="flex gap-3 text-sm">
                    <code className="text-indigo-400 w-32 flex-shrink-0">{p.name}</code>
                    <span className="text-slate-500 w-16 flex-shrink-0">{p.type}</span>
                    <span className={`w-14 flex-shrink-0 text-xs ${p.required ? 'text-red-400' : 'text-slate-600'}`}>{p.required ? 'required' : 'optional'}</span>
                    <span className="text-slate-400">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Response</p>
            <code className="text-xs text-slate-400">{ep.response}</code>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Example</p>
              <button onClick={copyExample} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
                {copiedEx ? <><CheckCircle size={12} className="text-emerald-400" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
            <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">{ep.example}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiDocs() {
  const [filter, setFilter] = useState('all');
  const tags = ['all', 'automation', 'expenses', 'loans', 'savings', 'data'];
  const visible = filter === 'all' ? ENDPOINTS : ENDPOINTS.filter(e => e.tag === filter);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h3 className="font-semibold mb-1">API Reference</h3>
      <p className="text-sm text-slate-400 mb-4">
        All endpoints accept and return JSON. When an API key is configured, include it as an
        <code className="text-indigo-400 mx-1">Authorization: Bearer &lt;key&gt;</code> header on every request.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {tags.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map(ep => <EndpointRow key={ep.method + ep.path} ep={ep} />)}
      </div>
    </div>
  );
}

export default function Settings() {
  const fileRef = useRef();
  const [restoreStatus, setRestoreStatus] = useState(null); // null | 'ok' | 'error'
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoring, setRestoring] = useState(false);

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.db')) {
      setRestoreStatus('error');
      setRestoreMsg('File must be a .db SQLite file');
      return;
    }
    if (!confirm(`Replace all current data with "${file.name}"? This cannot be undone.`)) return;

    setRestoring(true);
    setRestoreStatus(null);
    try {
      const key = localStorage.getItem('billy_api_key');
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
        },
        body: file,
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreStatus('ok');
        setRestoreMsg(data.message);
      } else {
        setRestoreStatus('error');
        setRestoreMsg(data.error || 'Restore failed');
      }
    } catch (err) {
      setRestoreStatus('error');
      setRestoreMsg(err.message);
    } finally {
      setRestoring(false);
      fileRef.current.value = '';
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-slate-400 text-sm mt-1">API, backup, and data management</p>
      </div>

      <div className="space-y-4">
        {/* Backup + Restore side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold mb-1">Backup</h3>
            <p className="text-sm text-slate-400 mb-4">Download your entire database as a single <code className="text-indigo-400">.db</code> file.</p>
            <button
              onClick={async () => {
                const key = localStorage.getItem(KEY_STORAGE);
                const res = await fetch('/api/backup', key ? { headers: { 'Authorization': `Bearer ${key}` } } : {});
                if (!res.ok) { alert('Backup failed — ' + (await res.json()).error); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `billy-backup-${new Date().toISOString().slice(0,10)}.db`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={16} /> Download Backup
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h3 className="font-semibold mb-1">Restore</h3>
            <p className="text-sm text-slate-400 mb-4">Upload a <code className="text-indigo-400">.db</code> backup to replace all current data.</p>
            <button onClick={() => fileRef.current.click()} disabled={restoring}
              className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Upload size={16} /> {restoring ? 'Restoring...' : 'Choose Backup File'}
            </button>
            <input ref={fileRef} type="file" accept=".db" className="hidden" onChange={handleRestore} />
            {restoreStatus === 'ok' && (
              <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle size={16} /> {restoreMsg} <button onClick={() => window.location.reload()} className="underline">Refresh now</button>
              </div>
            )}
            {restoreStatus === 'error' && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} /> {restoreMsg}
              </div>
            )}
          </div>
        </div>

        {/* API Key */}
        <ApiKeySection />

        {/* API Docs */}
        <ApiDocs />
      </div>
    </div>
  );
}
