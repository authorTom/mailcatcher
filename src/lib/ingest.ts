import { eq, sql } from 'drizzle-orm';

import { db, sqlite } from '@/db';
import { contacts, formStats, submissions, type Form } from '@/db/schema';
import { checkFormToken } from './crypto';
import { hashIp } from './crypto';
import { isDisposableEmail, isValidEmail, normaliseEmail } from './email';
import { newId } from './ids';
import {
  GLOBAL_RULE,
  PER_FORM_RULE,
  checkRateLimit,
  recordRateHit,
} from './rate-limit';
import { resolveUtm } from './utm';

/** Fields the pipeline consumes itself — never stored as contact data. */
const RESERVED = new Set([
  '_ts',
  '_url',
  '_referrer',
  '_redirect',
  '_utm_source',
  '_utm_medium',
  '_utm_campaign',
  '_utm_term',
  '_utm_content',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

const ALIASES: Record<'email' | 'name' | 'phone' | 'company', string[]> = {
  email: ['email', 'email_address', 'emailaddress', 'e-mail', 'mail'],
  name: ['name', 'full_name', 'fullname', 'your_name'],
  phone: ['phone', 'tel', 'telephone', 'phone_number', 'mobile'],
  company: ['company', 'organisation', 'organization', 'business', 'company_name'],
};

export type IngestOutcome =
  | { kind: 'accepted'; contactId: string; submissionId: string; isNewContact: boolean }
  /** Spam. The caller must respond as though it succeeded so the bot does not retry. */
  | { kind: 'trapped' }
  | { kind: 'rejected'; status: number; code: string; message: string };

function pick(payload: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const found = Object.keys(payload).find((k) => k.toLowerCase().replace(/\s+/g, '_') === key);
    if (found && payload[found]?.trim()) return payload[found]!.trim().slice(0, 500);
  }
  return null;
}

/** Map a free-form payload onto the promoted contact columns. */
function extractStandard(payload: Record<string, string>) {
  const first = pick(payload, ['first_name', 'firstname', 'fname']);
  const last = pick(payload, ['last_name', 'lastname', 'surname', 'lname']);
  const combined = [first, last].filter(Boolean).join(' ') || null;

  return {
    email: pick(payload, ALIASES.email),
    name: pick(payload, ALIASES.name) ?? combined,
    phone: pick(payload, ALIASES.phone),
    company: pick(payload, ALIASES.company),
  };
}

/** Everything that is not a reserved key, the honeypot, or a promoted column. */
function extractCustom(payload: Record<string, string>, honeypotName: string) {
  const standardKeys = new Set([
    ...Object.values(ALIASES).flat(),
    'first_name', 'firstname', 'fname', 'last_name', 'lastname', 'surname', 'lname',
  ]);

  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalised = key.toLowerCase().replace(/\s+/g, '_');
    if (RESERVED.has(normalised) || normalised === honeypotName) continue;
    if (standardKeys.has(normalised)) continue;
    if (!value?.trim()) continue;
    custom[key.slice(0, 60)] = value.trim().slice(0, 2000);
  }
  return custom;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bumpStats(formId: string, day: string, column: 'submits' | 'spam' | 'views') {
  db.insert(formStats)
    .values({ formId, day, [column]: 1 })
    .onConflictDoUpdate({
      target: [formStats.formId, formStats.day],
      set: { [column]: sql`${formStats[column]} + 1` },
    })
    .run();
}

export type IngestInput = {
  form: Form;
  payload: Record<string, string>;
  ip: string;
  userAgent: string | null;
  country: string | null;
  referrerHeader: string | null;
};

export function ingest({
  form,
  payload,
  ip,
  userAgent,
  country,
  referrerHeader,
}: IngestInput): IngestOutcome {
  const now = Date.now();
  const day = utcDay(new Date(now));
  const ipHash = hashIp(ip);
  const honeypotName = form.settings.honeypotName;

  /* --- Layer 1: honeypot ------------------------------------------------ */
  // A human never sees this field. Anything in it is a bot.
  if (payload[honeypotName]?.trim()) {
    recordSpam(form.id, day, 'honeypot', payload, ipHash, userAgent, country, referrerHeader);
    return { kind: 'trapped' };
  }

  /* --- Layer 2: time trap ----------------------------------------------- */
  const tokenState = checkFormToken(payload._ts, now);
  if (tokenState === 'too-fast' || tokenState === 'invalid') {
    recordSpam(form.id, day, `token:${tokenState}`, payload, ipHash, userAgent, country, referrerHeader);
    return { kind: 'trapped' };
  }
  // A missing or expired token is not proof of a bot — a hand-written form may
  // omit it, and a page left open overnight will have a stale one. Let it through.

  /* --- Layer 3: rate limiting ------------------------------------------- */
  const formKey = `f:${form.id}:${ipHash}`;
  const globalKey = `g:${ipHash}`;
  if (!checkRateLimit(formKey, PER_FORM_RULE, now) || !checkRateLimit(globalKey, GLOBAL_RULE, now)) {
    return {
      kind: 'rejected',
      status: 429,
      code: 'rate_limited',
      message: 'Too many submissions. Please try again later.',
    };
  }

  /* --- Layer 4: validation ---------------------------------------------- */
  const standard = extractStandard(payload);
  if (!standard.email) {
    return { kind: 'rejected', status: 422, code: 'email_required', message: 'An email address is required.' };
  }

  const email = normaliseEmail(standard.email);
  if (!isValidEmail(email)) {
    return { kind: 'rejected', status: 422, code: 'email_invalid', message: 'That email address does not look valid.' };
  }
  if (isDisposableEmail(email)) {
    recordSpam(form.id, day, 'disposable_email', payload, ipHash, userAgent, country, referrerHeader);
    return { kind: 'trapped' };
  }

  for (const field of form.fields) {
    if (!field.required) continue;
    if (field.key === 'email') continue;
    if (!payload[field.key]?.trim()) {
      return {
        kind: 'rejected',
        status: 422,
        code: 'field_required',
        message: `${field.label} is required.`,
      };
    }
  }

  /* --- Persist ----------------------------------------------------------- */
  const landingPageUrl = payload._url?.slice(0, 2000) ?? null;
  const referrer = (payload._referrer || referrerHeader)?.slice(0, 2000) ?? null;
  const utm = resolveUtm(payload, landingPageUrl, referrer);
  const custom = extractCustom(payload, honeypotName);
  const submissionId = newId();

  // One transaction: either the contact, the submission and the rollup all land,
  // or none of them do.
  const result = sqlite.transaction(() => {
    const existing = db.select().from(contacts).where(eq(contacts.email, email)).get();
    const isNewContact = !existing;
    const contactId = existing?.id ?? newId();

    if (existing) {
      db.update(contacts)
        .set({
          // Keep what we already know; only fill gaps or take a newer non-empty value.
          name: standard.name ?? existing.name,
          phone: standard.phone ?? existing.phone,
          company: standard.company ?? existing.company,
          data: { ...existing.data, ...custom },
          lastSeenAt: new Date(now),
          submissionCount: existing.submissionCount + 1,
          updatedAt: new Date(now),
        })
        .where(eq(contacts.id, contactId))
        .run();
    } else {
      db.insert(contacts)
        .values({
          id: contactId,
          email,
          name: standard.name,
          phone: standard.phone,
          company: standard.company,
          data: custom,
          firstFormId: form.id,
          firstSeenAt: new Date(now),
          lastSeenAt: new Date(now),
          submissionCount: 1,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .run();
    }

    db.insert(submissions)
      .values({
        id: submissionId,
        contactId,
        formId: form.id,
        payload: stripReserved(payload, honeypotName),
        ...utm,
        referrer,
        landingPageUrl,
        userAgent: userAgent?.slice(0, 500) ?? null,
        ipHash,
        country,
        isSpam: false,
        createdAt: new Date(now),
      })
      .run();

    bumpStats(form.id, day, 'submits');
    recordRateHit(formKey, now);
    recordRateHit(globalKey, now);

    return { contactId, isNewContact };
  })();

  return { kind: 'accepted', submissionId, ...result };
}

/**
 * The submitted fields as the visitor filled them in — minus the plumbing.
 *
 * The trap field and timing token are security noise, and the `_utm_*`/`_url`
 * values are already promoted to their own columns, so keeping them here would
 * just duplicate data and clutter the submission view.
 */
function stripReserved(payload: Record<string, string>, honeypotName: string) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalised = key.toLowerCase().replace(/\s+/g, '_');
    if (normalised === '_ts' || normalised === honeypotName) continue;
    if (RESERVED.has(normalised)) continue;
    out[key.slice(0, 60)] = String(value).slice(0, 2000);
  }
  return out;
}

/**
 * Spam is stored, not discarded — the dashboard shows what was blocked so you can
 * confirm the filters are not eating real signups.
 */
function recordSpam(
  formId: string,
  day: string,
  reason: string,
  payload: Record<string, string>,
  ipHash: string,
  userAgent: string | null,
  country: string | null,
  referrer: string | null,
) {
  sqlite.transaction(() => {
    // Spam is attributed to a sentinel contact so `submissions.contact_id` can stay
    // NOT NULL without polluting the real contact list.
    const sentinelEmail = 'spam@mailcatcher.invalid';
    let sentinel = db.select().from(contacts).where(eq(contacts.email, sentinelEmail)).get();

    if (!sentinel) {
      const id = newId();
      db.insert(contacts)
        .values({
          id,
          email: sentinelEmail,
          name: 'Blocked spam',
          data: {},
          status: 'unsubscribed',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          submissionCount: 0,
        })
        .run();
      sentinel = db.select().from(contacts).where(eq(contacts.email, sentinelEmail)).get()!;
    }

    db.insert(submissions)
      .values({
        id: newId(),
        contactId: sentinel.id,
        formId,
        payload,
        referrer,
        userAgent: userAgent?.slice(0, 500) ?? null,
        ipHash,
        country,
        isSpam: true,
        spamReason: reason,
      })
      .run();

    bumpStats(formId, day, 'spam');
  })();
}

/** Called when a hosted form is rendered, so conversion rate has a denominator. */
export function recordFormView(formId: string) {
  bumpStats(formId, utcDay(new Date()), 'views');
}
