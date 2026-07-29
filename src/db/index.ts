import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

export const DATABASE_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data/mailcatcher.db');

function createConnection() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  const connection = new Database(DATABASE_PATH);

  // WAL lets readers and the writer work concurrently — the single most
  // important setting for keeping the dashboard responsive while ingest writes.
  connection.pragma('journal_mode = WAL');
  // Wait rather than immediately throwing SQLITE_BUSY under a burst of submissions.
  connection.pragma('busy_timeout = 5000');
  // NORMAL is durable under WAL for anything short of an OS-level crash.
  connection.pragma('synchronous = NORMAL');
  connection.pragma('foreign_keys = ON');
  connection.pragma('temp_store = MEMORY');
  // ~64MB page cache: the whole working set stays in memory for typical volumes.
  connection.pragma('cache_size = -64000');

  return connection;
}

// Next.js dev reloads modules on every edit; without this we would leak a file
// handle (and a WAL reader) per reload.
const globalForDb = globalThis as unknown as {
  __mailcatcherSqlite?: Database.Database;
};

let connection: Database.Database | undefined;
let orm: BetterSQLite3Database<typeof schema> | undefined;

/**
 * The connection is opened on first use, not on import.
 *
 * `next build` imports every route module to collect its metadata. Connecting at
 * import time would mean the build loads the native SQLite addon and creates a
 * database — which is wrong on its own terms, and fails outright when the build
 * runs under QEMU emulation for a cross-architecture image.
 */
function getConnection(): Database.Database {
  if (connection) return connection;

  connection = globalForDb.__mailcatcherSqlite ?? createConnection();
  if (process.env.NODE_ENV !== 'production') globalForDb.__mailcatcherSqlite = connection;

  return connection;
}

/** Forwards every property access to the real object, opening it on demand. */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = resolve();
      const value = Reflect.get(target, property, target);
      // better-sqlite3's methods are native and need their own receiver.
      return typeof value === 'function' ? value.bind(target) : value;
    },
    has: (_target, property) => property in resolve(),
  });
}

export const sqlite = lazy<Database.Database>(getConnection);

export const db = lazy<BetterSQLite3Database<typeof schema>>(() => {
  if (!orm) orm = drizzle(getConnection(), { schema });
  return orm;
});

export { schema };
