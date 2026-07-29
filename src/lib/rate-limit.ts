import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { rateHits } from '@/db/schema';

export type RateLimitRule = { limit: number; windowMs: number };

/** Per-form burst guard. A real landing page never sees this from one person. */
export const PER_FORM_RULE: RateLimitRule = { limit: 5, windowMs: 10 * 60 * 1000 };
/** Global guard across every form, to stop a bot spraying all your endpoints. */
export const GLOBAL_RULE: RateLimitRule = { limit: 30, windowMs: 60 * 60 * 1000 };

const PRUNE_OLDER_THAN = 24 * 60 * 60 * 1000;

/**
 * Sliding-window rate limit backed by SQLite.
 *
 * Kept in the database rather than memory on purpose: the app runs as a single
 * container that may restart, and an in-memory counter would reset the window
 * every deploy — exactly when a bot would benefit most.
 */
export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): boolean {
  const since = new Date(now - rule.windowMs);

  const [row] = db
    .select({ count: sql<number>`count(*)` })
    .from(rateHits)
    .where(and(eq(rateHits.key, key), sql`${rateHits.createdAt} > ${since.getTime()}`))
    .all();

  return (row?.count ?? 0) < rule.limit;
}

export function recordRateHit(key: string, now = Date.now()): void {
  db.insert(rateHits).values({ key, createdAt: new Date(now) }).run();

  // Opportunistic cleanup — roughly 1 in 50 writes pays for pruning, which keeps
  // the table small without needing a scheduled job.
  if (Math.random() < 0.02) {
    db.delete(rateHits)
      .where(lt(rateHits.createdAt, new Date(now - PRUNE_OLDER_THAN)))
      .run();
  }
}

/** Extracts the client IP, trusting the proxy headers a self-hosted deploy sits behind. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? '0.0.0.0';
}
