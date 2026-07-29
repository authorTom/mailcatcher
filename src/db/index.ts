import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data/mailcatcher.db');

function createConnection() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  const sqlite = new Database(DATABASE_PATH);

  // WAL lets readers and the writer work concurrently — the single most
  // important setting for keeping the dashboard responsive while ingest writes.
  sqlite.pragma('journal_mode = WAL');
  // Wait rather than immediately throwing SQLITE_BUSY under a burst of submissions.
  sqlite.pragma('busy_timeout = 5000');
  // NORMAL is durable under WAL for anything short of an OS-level crash.
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('temp_store = MEMORY');
  // ~64MB page cache: the whole working set stays in memory for typical volumes.
  sqlite.pragma('cache_size = -64000');

  return sqlite;
}

// Next.js dev reloads modules on every edit; without this we would leak a file
// handle (and a WAL reader) per reload.
const globalForDb = globalThis as unknown as {
  __mailcatcherSqlite?: Database.Database;
};

export const sqlite = globalForDb.__mailcatcherSqlite ?? createConnection();
if (process.env.NODE_ENV !== 'production') globalForDb.__mailcatcherSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
