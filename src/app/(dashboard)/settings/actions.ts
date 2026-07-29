'use server';

import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, sqlite } from '@/db';
import { contacts, rateHits, submissions } from '@/db/schema';
import { SPAM_SENTINEL_EMAIL } from '@/lib/constants';
import { hashPassword } from '@/lib/password';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Turn a plaintext password into the argon2 hash to paste into the environment. */
export async function generatePasswordHash(password: string): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  if (password.length < 10) {
    return { ok: false, error: 'Use at least 10 characters.' };
  }
  return { ok: true, hash: await hashPassword(password) };
}

/** Delete blocked-spam rows. They are kept for reassurance, not forever. */
export async function purgeSpam(): Promise<ActionResult> {
  const result = db.delete(submissions).where(eq(submissions.isSpam, true)).run();
  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true, message: `Removed ${result.changes} spam record${result.changes === 1 ? '' : 's'}.` };
}

/**
 * Retention: drop submissions older than N days.
 *
 * Contacts are kept — losing the person because their submission aged out would
 * defeat the point of the tool. Only the event history is trimmed.
 */
export async function applyRetention(days: number): Promise<ActionResult> {
  if (!Number.isFinite(days) || days < 30) {
    return { ok: false, error: 'Choose a retention window of at least 30 days.' };
  }

  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = db.delete(submissions).where(lt(submissions.createdAt, cutoff)).run();

  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true, message: `Removed ${result.changes} submission${result.changes === 1 ? '' : 's'} older than ${days} days.` };
}

/** Reclaim disk space after a large delete. */
export async function vacuumDatabase(): Promise<ActionResult> {
  sqlite.exec('VACUUM');
  revalidatePath('/settings');
  return { ok: true, message: 'Database compacted.' };
}

export async function deleteAllContacts(confirmation: string): Promise<ActionResult> {
  if (confirmation !== 'DELETE') {
    return { ok: false, error: 'Type DELETE to confirm.' };
  }

  sqlite.transaction(() => {
    db.delete(contacts).where(ne(contacts.email, SPAM_SENTINEL_EMAIL)).run();
    db.delete(rateHits).run();
  })();

  revalidatePath('/');
  revalidatePath('/contacts');
  return { ok: true, message: 'All contacts and their submissions were deleted.' };
}

export type DatabaseStats = {
  contacts: number;
  submissions: number;
  spam: number;
  forms: number;
  tags: number;
  oldestSubmission: Date | null;
  sizeBytes: number;
};

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const pageCount = sqlite.pragma('page_count', { simple: true }) as number;
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;

  const counts = db
    .select({
      contacts: sql<number>`(select count(*) from contacts where email != ${SPAM_SENTINEL_EMAIL})`,
      submissions: sql<number>`(select count(*) from submissions where is_spam = 0)`,
      spam: sql<number>`(select count(*) from submissions where is_spam = 1)`,
      forms: sql<number>`(select count(*) from forms)`,
      tags: sql<number>`(select count(*) from tags)`,
      oldest: sql<number | null>`(select min(created_at) from submissions)`,
    })
    .from(sql`(select 1)`)
    .get();

  return {
    contacts: counts?.contacts ?? 0,
    submissions: counts?.submissions ?? 0,
    spam: counts?.spam ?? 0,
    forms: counts?.forms ?? 0,
    tags: counts?.tags ?? 0,
    oldestSubmission: counts?.oldest ? new Date(counts.oldest) : null,
    sizeBytes: pageCount * pageSize,
  };
}
