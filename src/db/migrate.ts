import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { db, sqlite, DATABASE_PATH } from './index';
import { ensureContactsFts } from './fts';

migrate(db, { migrationsFolder: './drizzle' });
ensureContactsFts(sqlite);

console.log(`✓ Migrations applied to ${DATABASE_PATH}`);
sqlite.close();
