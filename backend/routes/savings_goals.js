import { Router } from 'express';
import { db } from '../db.js';
import { toMonthly } from '../calculations.js';

const router = Router();

function enrichGoal(goal) {
  let monthly_contribution = toMonthly(goal.monthly_contribution || 0, goal.contribution_schedule || 'MONTHLY');

  if (goal.contribution_expense_id) {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(goal.contribution_expense_id);
    if (exp) monthly_contribution = toMonthly(exp.fixed_amount, exp.schedule);
  }

  // Estimate current amount by adding contributions since current_amount_date
  let estimated_current = goal.current_amount || 0;
  if (goal.current_amount_date && monthly_contribution > 0) {
    const from = new Date(goal.current_amount_date);
    const now = new Date();
    const monthsElapsed = Math.max(0,
      (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
    );
    estimated_current = Math.min(goal.target_amount, goal.current_amount + monthsElapsed * monthly_contribution);
  }

  const remaining = Math.max(0, goal.target_amount - estimated_current);
  const months_to_goal = monthly_contribution > 0 ? Math.ceil(remaining / monthly_contribution) : null;
  const progress_pct = goal.target_amount > 0 ? (estimated_current / goal.target_amount) * 100 : 0;

  return { ...goal, effective_monthly: monthly_contribution, estimated_current, remaining, months_to_goal, progress_pct };
}

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM savings_goals ORDER BY created_at').all().map(enrichGoal));
});

router.post('/', (req, res) => {
  const { name, target_amount, current_amount = 0, current_amount_date, monthly_contribution = 0, contribution_schedule = 'MONTHLY', contribution_expense_id, color = '#6366f1', notes } = req.body;
  if (!name?.trim() || !target_amount) return res.status(400).json({ error: 'name and target_amount are required' });

  const goal = db.prepare(`
    INSERT INTO savings_goals (name, target_amount, current_amount, current_amount_date, monthly_contribution, contribution_schedule, contribution_expense_id, color, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).get(name.trim(), target_amount, current_amount, current_amount_date || null, monthly_contribution, contribution_schedule, contribution_expense_id || null, color, notes || null);

  res.status(201).json(enrichGoal(goal));
});

router.put('/:id', (req, res) => {
  const { name, target_amount, current_amount = 0, current_amount_date, monthly_contribution = 0, contribution_schedule = 'MONTHLY', contribution_expense_id, color = '#6366f1', notes } = req.body;
  const goal = db.prepare(`
    UPDATE savings_goals SET name=?, target_amount=?, current_amount=?, current_amount_date=?, monthly_contribution=?, contribution_schedule=?, contribution_expense_id=?, color=?, notes=?
    WHERE id=? RETURNING *
  `).get(name, target_amount, current_amount, current_amount_date || null, monthly_contribution, contribution_schedule, contribution_expense_id || null, color, notes || null, req.params.id);

  if (!goal) return res.status(404).json({ error: 'Not found' });
  res.json(enrichGoal(goal));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM savings_goals WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
