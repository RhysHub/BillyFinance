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
        Used to authenticate external automation — e.g. posting new bills via <code className="text-indigo-400">POST /api/log-bill</code>.
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
            Send as <code className="text-slate-400">X-API-Key: {showKey ? keyInfo.api_key : '...'}</code> header in external requests.
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
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"name":"Power","amount":187.50,"date":"2026-03-15","notes":"AGL March"}'`,
  },
  {
    method: 'GET',
    path: '/api/expenses',
    tag: 'expenses',
    summary: 'List all expenses',
    desc: 'Returns all expenses with their entries, splits, and category info. Use ?q= to filter by name.',
    query: [
      { name: 'q', type: 'string', required: false, desc: 'Filter by name (case-insensitive partial match)' },
    ],
    response: 'Array of expense objects with entries[], splits[], category_name, etc.',
    example: `curl http://your-host/api/expenses?q=power \\
  -H "X-API-Key: YOUR_KEY"`,
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
      { name: 'is_variable', type: 'boolean', required: false, desc: 'True if amount varies — entries are averaged' },
      { name: 'category_id', type: 'string', required: false, desc: 'Category ID (get from GET /api/categories)' },
      { name: 'payment_group_id', type: 'string', required: false, desc: 'Payment group ID for splits' },
      { name: 'description', type: 'string', required: false, desc: 'Notes' },
      { name: 'splits', type: 'array', required: false, desc: '[{ member_id, percentage }] — manual splits (ignored if payment_group_id set)' },
    ],
    response: 'Full expense object',
    example: `curl -X POST http://your-host/api/expenses \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"name":"Electricity","schedule":"QUARTERLY","fixed_amount":320,"category_id":"..."}'`,
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
  -H "X-API-Key: YOUR_KEY" \\
  -d '{"amount":94.20,"date":"2026-03-10"}'`,
  },
  {
    method: 'GET',
    path: '/api/summary',
    tag: 'data',
    summary: 'Get cost summary',
    desc: 'Returns total weekly/fortnightly/monthly/annual costs and a per-member breakdown.',
    response: '{ total: { weekly, fortnightly, monthly, annually }, memberBreakdown: [{ id, name, weekly, ... }], categoryBreakdown: [...] }',
    example: `curl http://your-host/api/summary \\
  -H "X-API-Key: YOUR_KEY"`,
  },
  {
    method: 'GET',
    path: '/api/members',
    tag: 'data',
    summary: 'List members',
    desc: 'Returns all household members. Use member IDs when creating expenses with custom splits.',
    response: '[{ id, name, color, created_at }]',
    example: `curl http://your-host/api/members \\
  -H "X-API-Key: YOUR_KEY"`,
  },
  {
    method: 'GET',
    path: '/api/categories',
    tag: 'data',
    summary: 'List categories',
    desc: 'Returns all expense categories. Use category IDs when creating expenses.',
    response: '[{ id, name, color, icon }]',
    example: `curl http://your-host/api/categories \\
  -H "X-API-Key: YOUR_KEY"`,
  },
  {
    method: 'GET',
    path: '/api/payment-groups',
    tag: 'data',
    summary: 'List payment groups',
    desc: 'Returns all payment groups with their member splits.',
    response: '[{ id, name, members: [{ member_id, member_name, percentage }] }]',
    example: `curl http://your-host/api/payment-groups \\
  -H "X-API-Key: YOUR_KEY"`,
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
  const tags = ['all', 'automation', 'expenses', 'data'];
  const visible = filter === 'all' ? ENDPOINTS : ENDPOINTS.filter(e => e.tag === filter);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h3 className="font-semibold mb-1">API Reference</h3>
      <p className="text-sm text-slate-400 mb-4">
        All endpoints accept and return JSON. When an API key is configured, include it as an
        <code className="text-indigo-400 mx-1">X-API-Key</code> header on every request.
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
          ...(key ? { 'X-API-Key': key } : {}),
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
                const res = await fetch('/api/backup', key ? { headers: { 'X-API-Key': key } } : {});
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
