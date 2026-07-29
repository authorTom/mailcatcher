import type Database from 'better-sqlite3';

/**
 * Full-text search over contacts.
 *
 * Drizzle Kit does not emit virtual tables, so the FTS5 index and the triggers
 * that keep it in sync are created here and run after every migration.
 */
export function ensureContactsFts(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
      email,
      name,
      company,
      notes,
      content = 'contacts',
      content_rowid = 'rowid',
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
}

/** Rebuild the index from scratch — used after a bulk import or seed. */
export function rebuildContactsFts(sqlite: Database.Database) {
  sqlite.exec(`INSERT INTO contacts_fts(contacts_fts) VALUES ('rebuild');`);
}

/**
 * Turn free user input into a safe FTS5 MATCH expression.
 *
 * Every token is quoted, so punctuation common in emails can never be parsed as
 * FTS operators. A trailing `*` on the last token gives prefix search as you type.
 */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.\-_]+/u)
    .filter(Boolean)
    .map((t) => t.replaceAll('"', ''))
    .filter(Boolean);

  if (tokens.length === 0) return null;

  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(' AND ');
}
