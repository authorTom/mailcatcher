import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

/**
 * Container entrypoint: bring the database up to date, then start the server.
 *
 * Migrations run here rather than in the image build because the database lives
 * on a mounted volume that only exists at runtime.
 */

const DATABASE_PATH = process.env.DATABASE_PATH ?? '/data/mailcatcher.db';

if (!process.env.APP_SECRET) {
  console.error('✗ APP_SECRET is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD_HASH) {
  console.error('✗ ADMIN_PASSWORD_HASH is not set. Generate one with: npm run hash-password');
  process.exit(1);
}

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

/* --- Apply migrations ------------------------------------------------- */
db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  created_at NUMERIC
)`);

const applied = new Set(db.prepare('SELECT hash FROM __drizzle_migrations').all().map((r) => r.hash));

const journal = JSON.parse(fs.readFileSync('./drizzle/meta/_journal.json', 'utf8'));

for (const entry of journal.entries) {
  if (applied.has(entry.tag)) continue;

  const sql = fs.readFileSync(path.join('./drizzle', `${entry.tag}.sql`), 'utf8');
  const statements = sql.split('--> statement-breakpoint');

  db.transaction(() => {
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) db.exec(trimmed);
    }
    db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(entry.tag, Date.now());
  })();

  console.log(`✓ Applied migration ${entry.tag}`);
}

/* --- Full-text search index ------------------------------------------- */
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
    email, name, company, notes,
    content = 'contacts', content_rowid = 'rowid',
    tokenize = "unicode61 tokenchars '@.-_'"
  );
  CREATE TRIGGER IF NOT EXISTS contacts_fts_ai AFTER INSERT ON contacts BEGIN
    INSERT INTO contacts_fts(rowid, email, name, company, notes)
    VALUES (new.rowid, new.email, new.name, new.company, new.notes);
  END;
  CREATE TRIGGER IF NOT EXISTS contacts_fts_ad AFTER DELETE ON contacts BEGIN
    INSERT INTO contacts_fts(contacts_fts, rowid, email, name, company, notes)
    VALUES ('delete', old.rowid, old.email, old.name, old.company, old.notes);
  END;
  CREATE TRIGGER IF NOT EXISTS contacts_fts_au AFTER UPDATE ON contacts BEGIN
    INSERT INTO contacts_fts(contacts_fts, rowid, email, name, company, notes)
    VALUES ('delete', old.rowid, old.email, old.name, old.company, old.notes);
    INSERT INTO contacts_fts(rowid, email, name, company, notes)
    VALUES (new.rowid, new.email, new.name, new.company, new.notes);
  END;
`);

db.close();
console.log(`✓ Database ready at ${DATABASE_PATH}`);

/* --- Hand over to the server ------------------------------------------ */
spawn('node', ['server.js'], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
