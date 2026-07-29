'use server';

import { and, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, sqlite } from '@/db';
import { contactTags, contacts, segments, tags } from '@/db/schema';
import { SPAM_SENTINEL_EMAIL } from '@/lib/constants';
import { newId } from '@/lib/ids';
import { allMatchingIds, type ContactFilters } from '@/lib/queries/contacts';
import type { SegmentFilter } from '@/db/schema';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function refresh() {
  revalidatePath('/contacts');
  revalidatePath('/');
  revalidatePath('/tags');
}

export async function addTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  if (contactIds.length === 0) return { ok: false, error: 'No contacts selected.' };

  const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!tag) return { ok: false, error: 'That tag no longer exists.' };

  sqlite.transaction(() => {
    for (const contactId of contactIds) {
      db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing().run();
    }
  })();

  refresh();
  return { ok: true, message: `Tagged ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'}.` };
}

export async function removeTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  if (contactIds.length === 0) return { ok: false, error: 'No contacts selected.' };

  db.delete(contactTags)
    .where(and(inArray(contactTags.contactId, contactIds), eq(contactTags.tagId, tagId)))
    .run();

  refresh();
  return { ok: true, message: 'Tag removed.' };
}

export async function createTag(name: string, color: string): Promise<ActionResult & { id?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the tag a name.' };
  if (trimmed.length > 40) return { ok: false, error: 'Tag names are limited to 40 characters.' };

  const existing = db.select().from(tags).where(eq(tags.name, trimmed)).get();
  if (existing) return { ok: false, error: 'A tag with that name already exists.' };

  const id = newId();
  db.insert(tags).values({ id, name: trimmed, color }).run();

  refresh();
  return { ok: true, id, message: `Created “${trimmed}”.` };
}

export async function renameTag(tagId: string, name: string, color: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the tag a name.' };

  const clash = db.select().from(tags).where(and(eq(tags.name, trimmed), ne(tags.id, tagId))).get();
  if (clash) return { ok: false, error: 'Another tag already uses that name.' };

  db.update(tags).set({ name: trimmed, color }).where(eq(tags.id, tagId)).run();

  refresh();
  return { ok: true, message: 'Tag updated.' };
}

export async function deleteTag(tagId: string): Promise<ActionResult> {
  // contact_tags rows cascade, so the contacts themselves are untouched.
  db.delete(tags).where(eq(tags.id, tagId)).run();

  refresh();
  return { ok: true, message: 'Tag deleted.' };
}

/** Fold one tag into another, keeping every contact from both. */
export async function mergeTags(sourceId: string, targetId: string): Promise<ActionResult> {
  if (sourceId === targetId) return { ok: false, error: 'Pick two different tags.' };

  const target = db.select().from(tags).where(eq(tags.id, targetId)).get();
  if (!target) return { ok: false, error: 'Target tag no longer exists.' };

  sqlite.transaction(() => {
    const rows = db.select().from(contactTags).where(eq(contactTags.tagId, sourceId)).all();
    for (const row of rows) {
      db.insert(contactTags).values({ contactId: row.contactId, tagId: targetId }).onConflictDoNothing().run();
    }
    db.delete(tags).where(eq(tags.id, sourceId)).run();
  })();

  refresh();
  return { ok: true, message: `Merged into “${target.name}”.` };
}

export async function setContactStatus(
  contactIds: string[],
  status: 'subscribed' | 'unsubscribed',
): Promise<ActionResult> {
  if (contactIds.length === 0) return { ok: false, error: 'No contacts selected.' };

  db.update(contacts)
    .set({ status, updatedAt: new Date() })
    .where(and(inArray(contacts.id, contactIds), ne(contacts.email, SPAM_SENTINEL_EMAIL)))
    .run();

  refresh();
  return { ok: true, message: `Marked ${contactIds.length} as ${status}.` };
}

export async function updateNotes(contactId: string, notes: string): Promise<ActionResult> {
  db.update(contacts)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .run();

  revalidatePath('/contacts');
  return { ok: true, message: 'Notes saved.' };
}

export async function deleteContacts(contactIds: string[]): Promise<ActionResult> {
  if (contactIds.length === 0) return { ok: false, error: 'No contacts selected.' };

  // Submissions and tag links cascade from the FK definitions.
  db.delete(contacts)
    .where(and(inArray(contacts.id, contactIds), ne(contacts.email, SPAM_SENTINEL_EMAIL)))
    .run();

  refresh();
  return { ok: true, message: `Deleted ${contactIds.length} contact${contactIds.length === 1 ? '' : 's'}.` };
}

/**
 * Every id matching the current filters, for "select all N matching".
 * Returned to the client rather than held server-side so the bulk actions stay
 * plain id lists with no session state to keep in sync.
 */
export async function selectAllMatching(filters: ContactFilters): Promise<string[]> {
  return allMatchingIds(filters);
}

export async function saveSegment(name: string, filter: SegmentFilter): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the segment a name.' };

  db.insert(segments).values({ id: newId(), name: trimmed, filter }).run();

  refresh();
  return { ok: true, message: `Saved “${trimmed}”.` };
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  db.delete(segments).where(eq(segments.id, id)).run();
  refresh();
  return { ok: true, message: 'Segment deleted.' };
}
