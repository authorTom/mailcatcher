import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ *
 * JSON column shapes
 * ------------------------------------------------------------------ */

export type FieldType = 'email' | 'text' | 'tel' | 'textarea' | 'select' | 'checkbox';

export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export type FormSettings = {
  redirectUrl: string | null;
  successMessage: string;
  themeColor: string;
  /** Realistic-looking name for the hidden trap field, randomised per form. */
  honeypotName: string;
  /** Empty array means "allow any origin". */
  allowedOrigins: string[];
};

export type SegmentFilter = {
  search?: string;
  tagIds?: string[];
  formIds?: string[];
  status?: 'subscribed' | 'unsubscribed';
  from?: string;
  to?: string;
};

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

export const forms = sqliteTable(
  'forms',
  {
    // Public identifier — appears in the ingest URL, so it is a nanoid rather than a counter.
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status', { enum: ['active', 'paused', 'archived'] })
      .notNull()
      .default('active'),
    fields: text('fields', { mode: 'json' }).$type<FormField[]>().notNull(),
    settings: text('settings', { mode: 'json' }).$type<FormSettings>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex('forms_slug_idx').on(t.slug), index('forms_status_idx').on(t.status)],
);

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    /** Always stored lowercased and trimmed — see normaliseEmail(). */
    email: text('email').notNull(),
    name: text('name'),
    phone: text('phone'),
    company: text('company'),
    /** Any non-standard fields, merged across submissions (latest wins). */
    data: text('data', { mode: 'json' }).$type<Record<string, string>>().notNull(),
    status: text('status', { enum: ['subscribed', 'unsubscribed'] })
      .notNull()
      .default('subscribed'),
    notes: text('notes'),
    /** Attribution: the form that first captured this person. */
    firstFormId: text('first_form_id').references(() => forms.id, { onDelete: 'set null' }),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    submissionCount: integer('submission_count').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex('contacts_email_idx').on(t.email),
    index('contacts_last_seen_idx').on(t.lastSeenAt),
    index('contacts_status_idx').on(t.status),
    index('contacts_first_form_idx').on(t.firstFormId),
  ],
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    formId: text('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    /** The exact fields as submitted, before any normalisation. */
    payload: text('payload', { mode: 'json' }).$type<Record<string, string>>().notNull(),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),
    referrer: text('referrer'),
    landingPageUrl: text('landing_page_url'),
    userAgent: text('user_agent'),
    /** Salted hash — the raw IP is never written to disk. */
    ipHash: text('ip_hash'),
    country: text('country'),
    isSpam: integer('is_spam', { mode: 'boolean' }).notNull().default(false),
    spamReason: text('spam_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index('submissions_contact_idx').on(t.contactId),
    index('submissions_form_created_idx').on(t.formId, t.createdAt),
    index('submissions_created_idx').on(t.createdAt),
    index('submissions_spam_idx').on(t.isSpam),
    index('submissions_utm_source_idx').on(t.utmSource),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull().default('slate'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex('tags_name_idx').on(t.name)],
);

export const contactTags = sqliteTable(
  'contact_tags',
  {
    contactId: text('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    // Reverse lookup: "every contact carrying this tag".
    index('contact_tags_tag_idx').on(t.tagId),
  ],
);

export const segments = sqliteTable('segments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  filter: text('filter', { mode: 'json' }).$type<SegmentFilter>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * Pre-aggregated daily counts. The analytics dashboard reads this instead of
 * scanning `submissions`, so charts stay fast as the table grows.
 */
export const formStats = sqliteTable(
  'form_stats',
  {
    formId: text('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
    /** YYYY-MM-DD, UTC. */
    day: text('day').notNull(),
    views: integer('views').notNull().default(0),
    submits: integer('submits').notNull().default(0),
    spam: integer('spam').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.formId, t.day] }), index('form_stats_day_idx').on(t.day)],
);

/** Sliding-window rate limiting. Rows are pruned opportunistically on write. */
export const rateHits = sqliteTable(
  'rate_hits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('rate_hits_key_created_idx').on(t.key, t.createdAt)],
);

export type Form = typeof forms.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Segment = typeof segments.$inferSelect;
