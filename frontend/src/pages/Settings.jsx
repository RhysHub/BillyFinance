import { useRef, useState, useEffect } from 'react';
import { Download, Upload, CheckCircle, AlertCircle, Eye, EyeOff, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { api, KEY_STORAGE } from '../api.js';

function ApiKeySection() {
  const [keyInfo, setKeyInfo] = useState(null); // { api_key, source }
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

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
    try {
      await api.settings.setApiKey(key);
      localStorage.setItem(KEY_STORAGE, key);
      setKeyInfo({ api_key: key, source: 'db' });
      setShowKey(true);
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
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono truncate">
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
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
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
    <div className="p-8 max-w-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-slate-400 text-sm mt-1">Backup and restore your data</p>
      </div>

      <div className="space-y-4">
        {/* API Key */}
        <ApiKeySection />

        {/* Backup */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-1">Backup</h3>
          <p className="text-sm text-slate-400 mb-4">
            Downloads your entire database as a single <code className="text-indigo-400">.db</code> file.
            Use this before migrating to your TrueNAS instance.
          </p>
          <a
            href="/api/backup"
            download
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} /> Download Backup
          </a>
        </div>

        {/* Restore */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="font-semibold mb-1">Restore</h3>
          <p className="text-sm text-slate-400 mb-4">
            Upload a <code className="text-indigo-400">.db</code> backup file to replace all current data.
            The page will need a refresh after restoring.
          </p>
          <button
            onClick={() => fileRef.current.click()}
            disabled={restoring}
            className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
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

        {/* TrueNAS tip */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 text-sm text-slate-400">
          <p className="font-medium text-slate-300 mb-2">Migrating to TrueNAS?</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Click <span className="text-slate-200">Download Backup</span> above</li>
            <li>Stand up the Docker container on TrueNAS</li>
            <li>Open Billy on TrueNAS → Settings → Restore</li>
            <li>Upload the <code className="text-indigo-400">.db</code> file</li>
            <li>Refresh — all your data is there</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
