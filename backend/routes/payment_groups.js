import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function getGroup(id) {
  const group = db.prepare('SELECT * FROM payment_groups WHERE id=?').get(id);
  if (!group) return null;
  group.members = db.prepare(`
    SELECT pgm.*, m.name as member_name, m.color as member_color
    FROM payment_group_members pgm
    JOIN members m ON m.id = pgm.member_id
    WHERE pgm.group_id = ?
    ORDER BY m.name
  `).all(id);
  return group;
}

router.get('/', (req, res) => {
  const groups = db.prepare('SELECT * FROM payment_groups ORDER BY name').all();
  res.json(groups.map(g => getGroup(g.id)));
});

router.post('/', (req, res) => {
  const { name, members = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const { id } = db.prepare('INSERT INTO payment_groups (name) VALUES (?) RETURNING id').get(name.trim());
    if (members.length) {
      const ins = db.prepare('INSERT INTO payment_group_members (group_id, member_id, percentage) VALUES (?, ?, ?)');
      db.transaction(() => members.forEach(m => ins.run(id, m.member_id, m.percentage)))();
    }
    res.status(201).json(getGroup(id));
  } catch (e) {
    res.status(400).json({ error: 'Group name already exists' });
  }
});

router.put('/:id', (req, res) => {
  const { name, members = [] } = req.body;
  const existing = db.prepare('SELECT id FROM payment_groups WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE payment_groups SET name=? WHERE id=?').run(name, req.params.id);
  db.prepare('DELETE FROM payment_group_members WHERE group_id=?').run(req.params.id);
  if (members.length) {
    const ins = db.prepare('INSERT INTO payment_group_members (group_id, member_id, percentage) VALUES (?, ?, ?)');
    db.transaction(() => members.forEach(m => ins.run(req.params.id, m.member_id, m.percentage)))();
  }
  res.json(getGroup(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM payment_groups WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Bulk-assign this group to a set of expenses (replaces their payment_group_id)
router.post('/:id/assign', (req, res) => {
  const { expense_ids = [] } = req.body;
  if (!db.prepare('SELECT id FROM payment_groups WHERE id=?').get(req.params.id)) {
    return res.status(404).json({ error: 'Group not found' });
  }
  // Clear this group from all expenses first, then set for the provided ones
  db.prepare('UPDATE expenses SET payment_group_id=NULL WHERE payment_group_id=?').run(req.params.id);
  if (expense_ids.length) {
    const upd = db.prepare('UPDATE expenses SET payment_group_id=? WHERE id=?');
    db.transaction(() => expense_ids.forEach(id => upd.run(req.params.id, id)))();
  }
  res.json({ ok: true, assigned: expense_ids.length });
});

export default router;
