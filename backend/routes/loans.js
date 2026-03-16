import { Router } from 'express';
import { db } from '../db.js';
import { toMonthly } from '../calculations.js';

const router = Router();

const WEEKS_PER_PERIOD = { WEEKLY: 1, FORTNIGHTLY: 2, MONTHLY: 52 / 12, QUARTERLY: 13, ANNUALLY: 52 };
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Get the effective monthly payment for a loan, resolving linked expenses
function getEffectivePayments(loan) {
  let monthly_payment = loan.monthly_payment || 0;
  let extra_payment = loan.extra_payment || 0;

  if (loan.monthly_expense_id) {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(loan.monthly_expense_id);
    if (exp) monthly_payment = toMonthly(exp.amount, exp.schedule);
  }
  if (loan.extra_expense_id) {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(loan.extra_expense_id);
    if (exp) extra_payment = toMonthly(exp.amount, exp.schedule);
  }

  return { monthly_payment, extra_payment };
}

function computeCurrentBalance(loan, linkedExpenseIds) {
  if (!loan.balance_date) return loan.balance;

  const balanceDate = new Date(loan.balance_date);
  const today = new Date();
  let totalPaid = 0;

  // All linked expenses: monthly_expense_id, extra_expense_id, plus junction table
  const allIds = new Set([
    ...(loan.monthly_expense_id ? [loan.monthly_expense_id] : []),
    ...(loan.extra_expense_id ? [loan.extra_expense_id] : []),
    ...linkedExpenseIds,
  ]);

  for (const expId of allIds) {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expId);
    if (!exp) continue;

    if (exp.schedule === 'IRREGULAR') {
      const entries = db.prepare('SELECT * FROM bill_entries WHERE expense_id = ? AND date >= ?').all(expId, loan.balance_date);
      totalPaid += entries.reduce((s, e) => s + e.amount, 0);
    } else if (exp.schedule === 'ONCE') {
      totalPaid += exp.amount;
    } else {
      const weeksPerPeriod = WEEKS_PER_PERIOD[exp.schedule];
      if (weeksPerPeriod) {
        const weeksPassed = (today - balanceDate) / MS_PER_WEEK;
        const periodsPassed = Math.floor(weeksPassed / weeksPerPeriod);
        totalPaid += periodsPassed * exp.amount;
      }
    }
  }

  return Math.max(0, loan.balance - totalPaid);
}

function enrichLoan(loan) {
  const linked_expense_ids = db.prepare('SELECT expense_id FROM loan_linked_expenses WHERE loan_id = ?')
    .all(loan.id).map(r => r.expense_id);
  const current_balance = computeCurrentBalance(loan, linked_expense_ids);
  const { monthly_payment, extra_payment } = getEffectivePayments(loan);
  return { ...loan, linked_expense_ids, current_balance, effective_monthly: monthly_payment, effective_extra: extra_payment };
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM loans ORDER BY created_at').all().map(enrichLoan));
});

router.post('/', (req, res) => {
  const { name, balance, balance_date, interest_rate, monthly_payment = 0, extra_payment = 0, monthly_expense_id, extra_expense_id, notes, linked_expense_ids = [] } = req.body;
  if (!name?.trim() || !balance || !interest_rate) {
    return res.status(400).json({ error: 'name, balance and interest_rate are required' });
  }
  const loan = db.prepare(`
    INSERT INTO loans (name, balance, balance_date, interest_rate, monthly_payment, extra_payment, monthly_expense_id, extra_expense_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).get(name.trim(), balance, balance_date || null, interest_rate, monthly_payment || 0, extra_payment || 0, monthly_expense_id || null, extra_expense_id || null, notes || null);

  if (linked_expense_ids.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO loan_linked_expenses (loan_id, expense_id) VALUES (?, ?)');
    db.transaction(() => linked_expense_ids.forEach(eid => ins.run(loan.id, eid)))();
  }
  res.status(201).json(enrichLoan(loan));
});

router.put('/:id', (req, res) => {
  const { name, balance, balance_date, interest_rate, monthly_payment = 0, extra_payment = 0, monthly_expense_id, extra_expense_id, notes, linked_expense_ids = [] } = req.body;
  const loan = db.prepare(`
    UPDATE loans SET name=?, balance=?, balance_date=?, interest_rate=?, monthly_payment=?, extra_payment=?, monthly_expense_id=?, extra_expense_id=?, notes=?
    WHERE id=? RETURNING *
  `).get(name, balance, balance_date || null, interest_rate, monthly_payment || 0, extra_payment || 0, monthly_expense_id || null, extra_expense_id || null, notes || null, req.params.id);
  if (!loan) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM loan_linked_expenses WHERE loan_id = ?').run(req.params.id);
  if (linked_expense_ids.length) {
    const ins = db.prepare('INSERT OR IGNORE INTO loan_linked_expenses (loan_id, expense_id) VALUES (?, ?)');
    db.transaction(() => linked_expense_ids.forEach(eid => ins.run(req.params.id, eid)))();
  }
  res.json(enrichLoan(loan));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM loans WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
