import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

// Init DB (runs schema creation + seed on first boot)
import { db } from './db.js';

import membersRouter from './routes/members.js';
import savingsGoalsRouter from './routes/savings_goals.js';
import loansRouter from './routes/loans.js';
import paymentGroupsRouter from './routes/payment_groups.js';
import categoriesRouter from './routes/categories.js';
import expensesRouter from './routes/expenses.js';
import summaryRouter from './routes/summary.js';
import settingsRouter, { getDbKey } from './routes/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const API_KEY = process.env.API_KEY;

const app = express();
app.use(cors());
app.use(express.json());

// Optional API key auth — checks env var first, then DB-stored key
// /api/settings is always exempt so the UI can bootstrap
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/settings')) return next();
  const activeKey = API_KEY || getDbKey();
  if (!activeKey) return next();
  const provided = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (provided !== activeKey) return res.status(401).json({ error: 'Unauthorized — include Authorization: Bearer <key> header' });
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Backup: use SQLite online backup API — safe to run while the server is active
app.get('/api/backup', async (req, res) => {
  const dbPath = process.env.DB_PATH || './data/billy.db';
  const tmpPath = `${dbPath}.backup-tmp`;
  try {
    await db.backup(tmpPath);
    res.download(tmpPath, `billy-backup-${new Date().toISOString().slice(0,10)}.db`, () => {
      try { unlinkSync(tmpPath); } catch {}
    });
  } catch (e) {
    try { unlinkSync(tmpPath); } catch {}
    res.status(500).json({ error: `Backup failed: ${e.message}` });
  }
});

// Restore: upload a SQLite file to replace the current DB, then restart
app.post('/api/restore', (req, res) => {
  import('fs').then(({ createWriteStream }) => {
    const dbPath = process.env.DB_PATH || './data/billy.db';
    const out = createWriteStream(dbPath);
    req.pipe(out);
    out.on('finish', () => {
      res.json({ ok: true, message: 'Restored successfully — reloading...' });
      setTimeout(() => process.exit(0), 500);
    });
    out.on('error', (e) => res.status(500).json({ error: e.message }));
  });
});

app.use('/api/settings', settingsRouter);
app.use('/api/members', membersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api', summaryRouter);
app.use('/api/loans', loansRouter);
app.use('/api/savings-goals', savingsGoalsRouter);
app.use('/api/payment-groups', paymentGroupsRouter);

// Serve built frontend
const publicPath = join(__dirname, 'public');
if (existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(publicPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Billy running at http://0.0.0.0:${PORT}`);
});
