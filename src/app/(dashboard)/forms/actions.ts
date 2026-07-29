'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/db';
import { forms, type FormField, type FormSettings } from '@/db/schema';
import { newFormId, slugify } from '@/lib/ids';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Realistic-looking trap field names, chosen at random per form.
 *
 * Varying them per form means a bot that learns one site's honeypot has learned
 * nothing about the next, and each reads like a field a real form might have.
 */
const HONEYPOT_NAMES = [
  'company_website',
  'alternate_email',
  'office_phone',
  'fax_number',
  'billing_address',
  'referral_code',
];

function randomHoneypot(): string {
  return HONEYPOT_NAMES[Math.floor(Math.random() * HONEYPOT_NAMES.length)]!;
}

function refresh(id?: string) {
  revalidatePath('/forms');
  revalidatePath('/');
  if (id) revalidatePath(`/forms/${id}`);
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let candidate = slugify(base);
  let suffix = 2;

  for (;;) {
    const clash = db
      .select({ id: forms.id })
      .from(forms)
      .where(ignoreId ? and(eq(forms.slug, candidate), ne(forms.id, ignoreId)) : eq(forms.slug, candidate))
      .get();

    if (!clash) return candidate;
    candidate = `${slugify(base)}-${suffix++}`;
  }
}

export async function createForm(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the form a name.' };

  const id = newFormId();
  const settings: FormSettings = {
    redirectUrl: null,
    successMessage: 'Thanks — you are on the list.',
    themeColor: '#4f46e5',
    honeypotName: randomHoneypot(),
    allowedOrigins: [],
  };

  const fields: FormField[] = [
    { key: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'you@company.com' },
  ];

  db.insert(forms)
    .values({ id, name: trimmed, slug: await uniqueSlug(trimmed), status: 'active', fields, settings })
    .run();

  refresh(id);
  redirect(`/forms/${id}`);
}

export async function updateFormDetails(
  id: string,
  values: { name: string; status: 'active' | 'paused' | 'archived' },
): Promise<ActionResult> {
  const trimmed = values.name.trim();
  if (!trimmed) return { ok: false, error: 'Give the form a name.' };

  db.update(forms)
    .set({ name: trimmed, slug: await uniqueSlug(trimmed, id), status: values.status, updatedAt: new Date() })
    .where(eq(forms.id, id))
    .run();

  refresh(id);
  return { ok: true, message: 'Form updated.' };
}

export async function updateFormFields(id: string, fields: FormField[]): Promise<ActionResult> {
  if (!fields.some((f) => f.key === 'email')) {
    return { ok: false, error: 'An email field is required — it is what identifies a contact.' };
  }

  const keys = new Set<string>();
  for (const field of fields) {
    const key = field.key.trim();
    if (!key) return { ok: false, error: 'Every field needs a key.' };
    if (!/^[a-z0-9_]+$/.test(key)) {
      return { ok: false, error: `“${key}” is not a valid key — use lowercase letters, numbers and underscores.` };
    }
    if (keys.has(key)) return { ok: false, error: `Duplicate field key “${key}”.` };
    keys.add(key);
    if (!field.label.trim()) return { ok: false, error: `Field “${key}” needs a label.` };
  }

  db.update(forms).set({ fields, updatedAt: new Date() }).where(eq(forms.id, id)).run();

  refresh(id);
  return { ok: true, message: 'Fields saved.' };
}

export async function updateFormSettings(id: string, settings: FormSettings): Promise<ActionResult> {
  if (settings.redirectUrl) {
    try {
      const url = new URL(settings.redirectUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      return { ok: false, error: 'The redirect URL must be a full http(s) address.' };
    }
  }

  if (!/^#[0-9a-f]{6}$/i.test(settings.themeColor)) {
    return { ok: false, error: 'Pick a valid theme colour.' };
  }

  const cleanedOrigins = settings.allowedOrigins
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, ''));

  db.update(forms)
    .set({
      settings: {
        ...settings,
        successMessage: settings.successMessage.trim() || 'Thanks — you are on the list.',
        allowedOrigins: cleanedOrigins,
      },
      updatedAt: new Date(),
    })
    .where(eq(forms.id, id))
    .run();

  refresh(id);
  return { ok: true, message: 'Settings saved.' };
}

/** Rotate the trap field name — useful if a persistent bot has learned it. */
export async function rotateHoneypot(id: string): Promise<ActionResult> {
  const form = db.select().from(forms).where(eq(forms.id, id)).get();
  if (!form) return { ok: false, error: 'Form not found.' };

  let next = randomHoneypot();
  while (next === form.settings.honeypotName) next = randomHoneypot();

  db.update(forms)
    .set({ settings: { ...form.settings, honeypotName: next }, updatedAt: new Date() })
    .where(eq(forms.id, id))
    .run();

  refresh(id);
  return { ok: true, message: `Trap field is now “${next}”. Update any hand-written HTML.` };
}

export async function deleteForm(id: string): Promise<ActionResult> {
  // Submissions cascade. Contacts survive — a person captured by this form is
  // still a contact, they simply lose the attribution.
  db.delete(forms).where(eq(forms.id, id)).run();

  refresh();
  redirect('/forms');
}
