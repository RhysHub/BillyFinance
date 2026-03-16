import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/billy.db';

// Ensure data directory exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migration: fix broken FK references caused by SQLite auto-updating refs during rename
// Also handles removing the CHECK constraint from expenses.schedule for IRREGULAR support
function rebuildChildTable(tableName, createSQL) {
  const current = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
  if (current?.sql?.includes('expenses_old')) {
    db.exec(`
      ALTER TABLE ${tableName} RENAME TO ${tableName}_old;
      ${createSQL}
      INSERT INTO ${tableName} SELECT * FROM ${tableName}_old;
      DROP TABLE ${tableName}_old;
    `);
  }
}

db.pragma('foreign_keys = OFF');

// Fix expenses table if it still has the CHECK constraint
const expensesSQL = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'").get();
if (expensesSQL?.sql?.includes('CHECK')) {
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    ALTER TABLE expenses RENAME TO expenses_old;
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      name TEXT NOT NULL,
      description TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      schedule TEXT NOT NULL,
      is_variable INTEGER NOT NULL DEFAULT 0,
      fixed_amount REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO expenses (id, name, description, category_id, schedule, is_variable, fixed_amount, is_active, created_at)
    SELECT id, name, description, category_id, schedule, is_variable, fixed_amount, is_active, created_at FROM expenses_old;
    DROP TABLE expenses_old;
  `);
  db.pragma('legacy_alter_table = OFF');
}

// Fix bill_entries and expense_splits if their FKs were broken by a previous migration
rebuildChildTable('bill_entries', `
  CREATE TABLE bill_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
rebuildChildTable('expense_splits', `
  CREATE TABLE expense_splits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    percentage REAL NOT NULL DEFAULT 0,
    UNIQUE(expense_id, member_id)
  );
`);

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#f59e0b',
    icon TEXT
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL,
    description TEXT,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    schedule TEXT NOT NULL CHECK(schedule IN ('WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY','ANNUALLY','ONCE')),
    is_variable INTEGER NOT NULL DEFAULT 0,
    fixed_amount REAL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bill_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    percentage REAL NOT NULL DEFAULT 0,
    UNIQUE(expense_id, member_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS payment_groups (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payment_group_members (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    group_id TEXT NOT NULL REFERENCES payment_groups(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    percentage REAL NOT NULL DEFAULT 0,
    UNIQUE(group_id, member_id)
  );
`);

// Add payment_group_id to expenses if missing
const expCols = db.pragma('table_info(expenses)').map(c => c.name);
if (!expCols.includes('payment_group_id')) {
  db.exec('ALTER TABLE expenses ADD COLUMN payment_group_id TEXT REFERENCES payment_groups(id) ON DELETE SET NULL');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    name TEXT NOT NULL,
    balance REAL NOT NULL,
    interest_rate REAL NOT NULL,
    monthly_payment REAL NOT NULL,
    extra_payment REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS loan_linked_expenses (
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    PRIMARY KEY (loan_id, expense_id)
  );
`);

// Add balance_date, monthly_expense_id, extra_expense_id to loans if missing
const loanCols = db.pragma('table_info(loans)').map(c => c.name);
if (!loanCols.includes('balance_date')) db.exec('ALTER TABLE loans ADD COLUMN balance_date TEXT');
if (!loanCols.includes('monthly_expense_id')) db.exec('ALTER TABLE loans ADD COLUMN monthly_expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL');
if (!loanCols.includes('extra_expense_id')) db.exec('ALTER TABLE loans ADD COLUMN extra_expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL');
if (!loanCols.includes('initial_balance')) db.exec('ALTER TABLE loans ADD COLUMN initial_balance REAL');
if (!loanCols.includes('start_date')) db.exec('ALTER TABLE loans ADD COLUMN start_date TEXT');
if (!loanCols.includes('loan_term_years')) db.exec('ALTER TABLE loans ADD COLUMN loan_term_years INTEGER');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed default categories on first run
const { n } = db.prepare('SELECT COUNT(*) as n FROM categories').get();
if (n === 0) {
  const ins = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
  db.transaction(() => {
    [
      ['Housing',          '#3b82f6', '🏠'],
      ['Utilities',        '#f59e0b', '⚡'],
      ['Food & Groceries', '#10b981', '🛒'],
      ['Insurance',        '#f97316', '🛡️'],
      ['Transport',        '#8b5cf6', '🚗'],
      ['Subscriptions',    '#06b6d4', '📺'],
      ['Health',           '#ef4444', '💊'],
      ['Other',            '#6b7280', '📦'],
    ].forEach(([name, color, icon]) => ins.run(name, color, icon));
  })();
}
