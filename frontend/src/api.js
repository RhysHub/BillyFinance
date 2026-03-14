const BASE = '/api';

export const KEY_STORAGE = 'billy_api_key';

async function req(path, opts = {}) {
  const key = localStorage.getItem(KEY_STORAGE);
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : {}),
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  members: {
    list:   ()          => req('/members'),
    create: (data)      => req('/members', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data)  => req(`/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id)        => req(`/members/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list:   ()          => req('/categories'),
    create: (data)      => req('/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data)  => req(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id)        => req(`/categories/${id}`, { method: 'DELETE' }),
  },
  expenses: {
    list:        ()             => req('/expenses'),
    get:         (id)           => req(`/expenses/${id}`),
    create:      (data)         => req('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    update:      (id, data)     => req(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete:      (id)           => req(`/expenses/${id}`, { method: 'DELETE' }),
    addEntry:    (id, data)     => req(`/expenses/${id}/entries`, { method: 'POST', body: JSON.stringify(data) }),
    deleteEntry: (id, entryId)  => req(`/expenses/${id}/entries/${entryId}`, { method: 'DELETE' }),
  },
  paymentGroups: {
    list:   ()              => req('/payment-groups'),
    create: (data)          => req('/payment-groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data)      => req(`/payment-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id)            => req(`/payment-groups/${id}`, { method: 'DELETE' }),
    assign: (id, expenseIds) => req(`/payment-groups/${id}/assign`, { method: 'POST', body: JSON.stringify({ expense_ids: expenseIds }) }),
  },
  loans: {
    list:   ()         => req('/loans'),
    create: (data)     => req('/loans', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => req(`/loans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id)       => req(`/loans/${id}`, { method: 'DELETE' }),
  },
  summary:     ()              => req('/summary'),
  projections: (months = 12)  => req(`/projections?months=${months}`),
  settings: {
    get:          ()      => req('/settings'),
    setApiKey:    (key)   => req('/settings/api-key', { method: 'PUT', body: JSON.stringify({ key }) }),
    deleteApiKey: ()      => req('/settings/api-key', { method: 'DELETE' }),
  },
};
