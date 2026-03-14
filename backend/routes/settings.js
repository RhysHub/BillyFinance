import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function getDbKey() {
  return db.prepare(`SELECT value FROM settings WHERE key='api_key'`).get()?.value ?? null;
}

// GET /api/settings — returns current key config (unprotected so browser can bootstrap)
router.get('/', (req, res) => {
  const envKey = process.env.API_KEY || null;
  const dbKey = getDbKey();
  const active = envKey || dbKey;
  res.json({
    api_key: active,
    source: envKey ? 'env' : dbKey ? 'db' : 'none',
  });
});

// PUT /api/settings/api-key { key } — save key to DB
router.put('/api-key', (req, res) => {
  const { key } = req.body;
  if (!key?.trim()) return res.status(400).json({ error: 'key required' });
  db.prepare(`INSERT INTO settings (key, value) VALUES ('api_key', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key.trim());
  res.json({ ok: true });
});

// DELETE /api/settings/api-key — clear DB key
router.delete('/api-key', (req, res) => {
  db.prepare(`DELETE FROM settings WHERE key='api_key'`).run();
  res.json({ ok: true });
});

export { getDbKey };
export default router;
