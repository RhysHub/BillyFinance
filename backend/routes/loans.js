import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM loans ORDER BY created_at').all());
});

router.post('/', (req, res) => {
  const { name, balance, interest_rate, monthly_payment, extra_payment = 0, notes } = req.body;
  if (!name?.trim() || !balance || !interest_rate || !monthly_payment) {
    return res.status(400).json({ error: 'name, balance, interest_rate and monthly_payment are required' });
  }
  const result = db.prepare(`
    INSERT INTO loans (name, balance, interest_rate, monthly_payment, extra_payment, notes)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING *
  `).get(name.trim(), balance, interest_rate, monthly_payment, extra_payment, notes || null);
  res.status(201).json(result);
});

router.put('/:id', (req, res) => {
  const { name, balance, interest_rate, monthly_payment, extra_payment = 0, notes } = req.body;
  const result = db.prepare(`
    UPDATE loans SET name=?, balance=?, interest_rate=?, monthly_payment=?, extra_payment=?, notes=?
    WHERE id=? RETURNING *
  `).get(name, balance, interest_rate, monthly_payment, extra_payment, notes || null, req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM loans WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
