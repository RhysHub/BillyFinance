import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function getExpense(id) {
  const expense = db.prepare(`
    SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.id = ?
  `).get(id);
  if (!expense) return null;

  expense.entries = db.prepare('SELECT * FROM bill_entries WHERE expense_id=? ORDER BY date DESC').all(id);
  expense.splits = db.prepare(`
    SELECT s.*, m.name as member_name, m.color as member_color
    FROM expense_splits s JOIN members m ON m.id = s.member_id
    WHERE s.expense_id = ?
  `).all(id);
  if (expense.payment_group_id) {
    expense.payment_group = db.prepare(`
      SELECT pg.*, pgm.member_id, pgm.percentage, m.name as member_name, m.color as member_color
      FROM payment_groups pg
      JOIN payment_group_members pgm ON pgm.group_id = pg.id
      JOIN members m ON m.id = pgm.member_id
      WHERE pg.id = ?
    `).all(expense.payment_group_id);
  }
  expense.is_variable = !!expense.is_variable;
  expense.is_active = !!expense.is_active;
  return expense;
}

router.get('/', (req, res) => {
  const { q } = req.query;
  const rows = q
    ? db.prepare(`
        SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
        WHERE LOWER(e.name) LIKE LOWER(?) ORDER BY e.created_at DESC
      `).all(`%${q}%`)
    : db.prepare(`
        SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
        ORDER BY e.created_at DESC
      `).all();

  const ids = rows.map(r => r.id);
  const entries = ids.length ? db.prepare(`SELECT * FROM bill_entries WHERE expense_id IN (${ids.map(() => '?').join(',')}) ORDER BY date DESC`).all(...ids) : [];
  const splits = ids.length ? db.prepare(`
    SELECT s.*, m.name as member_name, m.color as member_color
    FROM expense_splits s JOIN members m ON m.id = s.member_id
    WHERE s.expense_id IN (${ids.map(() => '?').join(',')})
  `).all(...ids) : [];

  res.json(rows.map(r => ({
    ...r,
    is_variable: !!r.is_variable,
    is_active: !!r.is_active,
    entries: entries.filter(e => e.expense_id === r.id),
    splits: splits.filter(s => s.expense_id === r.id),
  })));
});

router.get('/:id', (req, res) => {
  const expense = getExpense(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Not found' });
  res.json(expense);
});

router.post('/', (req, res) => {
  const { name, description, category_id, schedule, is_variable, fixed_amount, payment_group_id, splits = [] } = req.body;
  if (!name?.trim() || !schedule) return res.status(400).json({ error: 'Name and schedule required' });

  const { id } = db.prepare(`
    INSERT INTO expenses (name, description, category_id, schedule, is_variable, fixed_amount, payment_group_id)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
  `).get(name.trim(), description || null, category_id || null, schedule, is_variable ? 1 : 0, is_variable ? null : fixed_amount, payment_group_id || null);

  if (splits.length) {
    const ins = db.prepare('INSERT OR REPLACE INTO expense_splits (expense_id, member_id, percentage) VALUES (?, ?, ?)');
    db.transaction(() => splits.forEach(s => ins.run(id, s.member_id, s.percentage)))();
  }

  res.status(201).json(getExpense(id));
});

router.put('/:id', (req, res) => {
  const { name, description, category_id, schedule, is_variable, fixed_amount, is_active, payment_group_id, splits } = req.body;
  const existing = db.prepare('SELECT id FROM expenses WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare(`
    UPDATE expenses SET name=?, description=?, category_id=?, schedule=?, is_variable=?, fixed_amount=?, is_active=?, payment_group_id=?
    WHERE id=?
  `).run(name, description || null, category_id || null, schedule, is_variable ? 1 : 0, is_variable ? null : fixed_amount, is_active !== false ? 1 : 0, payment_group_id || null, req.params.id);

  if (splits !== undefined) {
    db.prepare('DELETE FROM expense_splits WHERE expense_id=?').run(req.params.id);
    if (splits.length) {
      const ins = db.prepare('INSERT INTO expense_splits (expense_id, member_id, percentage) VALUES (?, ?, ?)');
      db.transaction(() => splits.forEach(s => ins.run(req.params.id, s.member_id, s.percentage)))();
    }
  }

  res.json(getExpense(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM expenses WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Bill entries (variable expenses)
router.get('/:id/entries', (req, res) => {
  res.json(db.prepare('SELECT * FROM bill_entries WHERE expense_id=? ORDER BY date DESC').all(req.params.id));
});

router.post('/:id/entries', (req, res) => {
  const { amount, date, notes } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'Amount and date required' });
  const result = db.prepare('INSERT INTO bill_entries (expense_id, amount, date, notes) VALUES (?, ?, ?, ?) RETURNING *')
    .get(req.params.id, parseFloat(amount), date, notes || null);
  res.status(201).json(result);
});

router.delete('/:expenseId/entries/:id', (req, res) => {
  const info = db.prepare('DELETE FROM bill_entries WHERE id=? AND expense_id=?').run(req.params.id, req.params.expenseId);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Convenience: log a bill entry by expense name (for automation / Claude integration)
// POST /api/expenses/log  { name, amount, date, notes? }
// Finds the expense by name (case-insensitive, exact match first then partial), adds an entry.
router.post('/log', (req, res) => {
  const { name, amount, date, notes } = req.body;
  if (!name || !amount || !date) {
    return res.status(400).json({ error: 'name, amount, and date are required' });
  }

  // Exact match first, then partial
  const expense =
    db.prepare(`SELECT * FROM expenses WHERE LOWER(name) = LOWER(?)`).get(name) ||
    db.prepare(`SELECT * FROM expenses WHERE LOWER(name) LIKE LOWER(?)`).get(`%${name}%`);

  if (!expense) {
    const all = db.prepare(`SELECT name FROM expenses ORDER BY name`).all().map(r => r.name);
    return res.status(404).json({ error: `No expense found matching "${name}"`, available: all });
  }

  const entry = db.prepare('INSERT INTO bill_entries (expense_id, amount, date, notes) VALUES (?, ?, ?, ?) RETURNING *')
    .get(expense.id, parseFloat(amount), date, notes || null);

  res.status(201).json({ expense_id: expense.id, expense_name: expense.name, entry });
});

export default router;
