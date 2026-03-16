import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY created_at').all());
});

router.post('/', (req, res) => {
  const { name, color = '#6366f1', income_amount, income_schedule = 'MONTHLY' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO members (name, color, income_amount, income_schedule) VALUES (?, ?, ?, ?) RETURNING *')
    .get(name.trim(), color, income_amount || null, income_schedule);
  res.status(201).json(result);
});

router.put('/:id', (req, res) => {
  const { name, color, income_amount, income_schedule = 'MONTHLY' } = req.body;
  const result = db.prepare('UPDATE members SET name=?, color=?, income_amount=?, income_schedule=? WHERE id=? RETURNING *')
    .get(name, color, income_amount || null, income_schedule, req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM members WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
