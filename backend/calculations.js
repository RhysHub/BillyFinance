// Weeks per billing period (exact)
const WEEKS = {
  WEEKLY:      1,
  FORTNIGHTLY: 2,
  MONTHLY:     52 / 12,  // ~4.333
  QUARTERLY:   13,
  ANNUALLY:    52,
  ONCE:        0,
};

export function toMonthly(amount, schedule) {
  if (schedule === 'ONCE' || !WEEKS[schedule]) return 0;
  return (amount / WEEKS[schedule]) * WEEKS.MONTHLY;
}

export function fromMonthly(monthly, schedule) {
  if (schedule === 'ONCE' || !WEEKS[schedule]) return 0;
  return (monthly / WEEKS.MONTHLY) * WEEKS[schedule];
}

export function getEffectiveAmount(expense, entries = []) {
  if (!expense.is_variable) return expense.fixed_amount || 0;
  if (!entries.length) return 0;
  return entries.reduce((sum, e) => sum + e.amount, 0) / entries.length;
}

// For IRREGULAR: group transactions by month, average monthly totals
export function getMonthlyFromTransactions(entries = []) {
  if (!entries.length) return 0;
  const byMonth = {};
  entries.forEach(e => {
    const month = (e.date || '').slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + e.amount;
  });
  const totals = Object.values(byMonth);
  return totals.reduce((s, v) => s + v, 0) / totals.length;
}

export function getMonthlyAmount(expense, entries = []) {
  if (expense.schedule === 'IRREGULAR') return getMonthlyFromTransactions(entries);
  return toMonthly(getEffectiveAmount(expense, entries), expense.schedule);
}

export function periodLabel(schedule) {
  return {
    WEEKLY:      'per week',
    FORTNIGHTLY: 'per fortnight',
    MONTHLY:     'per month',
    QUARTERLY:   'per quarter',
    ANNUALLY:    'per year',
    ONCE:        'one-time',
  }[schedule] || schedule;
}
