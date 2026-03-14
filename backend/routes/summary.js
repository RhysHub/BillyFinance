import { Router } from 'express';
import { db } from '../db.js';
import { getMonthlyAmount, fromMonthly, getEffectiveAmount } from '../calculations.js';

const router = Router();

function buildSummary() {
  const expenses = db.prepare(`
    SELECT e.*, c.name as category_name, c.color as category_color
    FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.is_active = 1
  `).all();

  const members = db.prepare('SELECT * FROM members ORDER BY created_at').all();

  if (!expenses.length) return {
    total: { monthly: 0, weekly: 0, fortnightly: 0, annually: 0 },
    memberBreakdown: members.map(m => ({ ...m, monthly: 0, weekly: 0, fortnightly: 0, annually: 0 })),
    categoryBreakdown: [],
    expenseCount: 0,
  };

  const ids = expenses.map(e => e.id);
  const allEntries = ids.length ? db.prepare(`SELECT * FROM bill_entries WHERE expense_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const allSplits = ids.length ? db.prepare(`SELECT * FROM expense_splits WHERE expense_id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];

  // Load group splits for any expenses that use a payment group
  const groupIds = [...new Set(expenses.map(e => e.payment_group_id).filter(Boolean))];
  const allGroupMembers = groupIds.length
    ? db.prepare(`SELECT * FROM payment_group_members WHERE group_id IN (${groupIds.map(() => '?').join(',')})`).all(...groupIds)
    : [];

  let totalMonthly = 0;
  const memberTotals = {};
  members.forEach(m => memberTotals[m.id] = 0);
  const catTotals = {};

  for (const exp of expenses) {
    const entries = allEntries.filter(e => e.expense_id === exp.id);
    const monthly = getMonthlyAmount({ ...exp, is_variable: !!exp.is_variable }, entries);
    totalMonthly += monthly;

    // Category breakdown
    const catKey = exp.category_id || 'uncategorized';
    if (!catTotals[catKey]) catTotals[catKey] = { name: exp.category_name || 'Uncategorized', color: exp.category_color || '#6b7280', monthly: 0 };
    catTotals[catKey].monthly += monthly;

    // Member split: use payment group if set, else expense-specific splits, else equal
    const splits = exp.payment_group_id
      ? allGroupMembers.filter(m => m.group_id === exp.payment_group_id)
          .map(m => ({ member_id: m.member_id, percentage: m.percentage }))
      : allSplits.filter(s => s.expense_id === exp.id);

    if (splits.length) {
      const totalPct = splits.reduce((s, x) => s + x.percentage, 0);
      splits.forEach(s => {
        if (memberTotals[s.member_id] !== undefined) {
          memberTotals[s.member_id] += monthly * (s.percentage / (totalPct || 100));
        }
      });
    } else {
      if (members.length) {
        const share = monthly / members.length;
        members.forEach(m => memberTotals[m.id] += share);
      }
    }
  }

  return {
    total: {
      monthly: totalMonthly,
      weekly: fromMonthly(totalMonthly, 'WEEKLY'),
      fortnightly: fromMonthly(totalMonthly, 'FORTNIGHTLY'),
      annually: fromMonthly(totalMonthly, 'ANNUALLY'),
    },
    memberBreakdown: members.map(m => ({
      ...m,
      monthly: memberTotals[m.id],
      weekly: fromMonthly(memberTotals[m.id], 'WEEKLY'),
      fortnightly: fromMonthly(memberTotals[m.id], 'FORTNIGHTLY'),
      annually: fromMonthly(memberTotals[m.id], 'ANNUALLY'),
    })),
    categoryBreakdown: Object.values(catTotals).sort((a, b) => b.monthly - a.monthly),
    expenseCount: expenses.length,
  };
}

router.get('/summary', (req, res) => {
  res.json(buildSummary());
});

router.get('/projections', (req, res) => {
  const months = parseInt(req.query.months) || 12;
  const summary = buildSummary();
  const monthlyBase = summary.total.monthly;

  const result = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push({
      month: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
      total: monthlyBase,
      perMember: summary.memberBreakdown.map(m => ({ id: m.id, name: m.name, color: m.color, amount: m.monthly })),
    });
  }

  res.json({
    months: result,
    annualTotal: monthlyBase * 12,
    memberBreakdown: summary.memberBreakdown,
  });
});

export default router;
