import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, color = '#6b7280', icon = '📦' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?) RETURNING *').get(name.trim(), color, icon);
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: 'Category name already exists' });
  }
});

router.put('/:id', (req, res) => {
  const { name, color, icon } = req.body;
  const result = db.prepare('UPDATE categories SET name=?, color=?, icon=? WHERE id=? RETURNING *').get(name, color, icon, req.params.id);
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.json(result);
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
