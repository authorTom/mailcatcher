import { eq } from 'drizzle-orm';

import { db, sqlite } from './index';
import { rebuildContactsFts } from './fts';
import {
  contactTags,
  contacts,
  formStats,
  forms,
  rateHits,
  segments,
  submissions,
  tags,
  type FormField,
  type FormSettings,
} from './schema';
import { newFormId, newId } from '../lib/ids';
import { hashIp } from '../lib/crypto';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const FIRST = ['Amelia','Oliver','Isla','Noah','Freya','George','Ava','Leo','Sophia','Arthur','Mia','Harry','Grace','Jack','Ruby','Charlie','Ivy','Oscar','Elsie','Henry','Poppy','Theo','Willow','Alfie','Daisy','Finn','Maya','Rory','Nina','Sam','Priya','Omar','Yusuf','Aisha','Chen','Lucas','Zara','Ethan','Nadia','Marco'];
const LAST = ['Bennett','Okafor','Whitfield','Marsh','Delgado','Ferreira','Hollis','Nakamura','Ashcroft','Vance','Ridley','Costa','Underwood','Bright','Kowalski','Rahman','Sinclair','Novak','Ellery','Moreau','Fairbanks','Haddad','Lindqvist','Beaumont','Trent','Ozturk','Calloway','Duarte','Rosenberg','Ward'];
const COMPANIES = ['Northwind Studio','Kestrel Labs','Bright Harbour','Tessellate','Orbit & Co','Verdant Supply','Halcyon Digital','Meridian Craft','Lumen Works','Foxglove Media','Ironbark','Saltmarsh','Aperture Group','Cadence','Blue Anchor',null,null,null,null,null];
const DOMAINS = ['gmail.com','outlook.com','hotmail.com','proton.me','icloud.com','yahoo.co.uk'];

const SOURCES: Array<{ source: string; medium: string; campaigns: string[]; weight: number }> = [
  { source: 'google', medium: 'cpc', campaigns: ['brand-search', 'spring-promo', 'competitor-terms'], weight: 30 },
  { source: 'newsletter', medium: 'email', campaigns: ['weekly-digest', 'product-update'], weight: 20 },
  { source: 'linkedin', medium: 'social', campaigns: ['founder-post', 'case-study'], weight: 16 },
  { source: 'producthunt', medium: 'referral', campaigns: ['launch-day'], weight: 10 },
  { source: 'twitter', medium: 'social', campaigns: ['launch-thread'], weight: 9 },
  { source: 'reddit', medium: 'social', campaigns: ['ama'], weight: 5 },
  { source: '', medium: '', campaigns: [''], weight: 10 },
];

const REFERRERS = ['https://www.google.com/','https://news.ycombinator.com/','https://www.linkedin.com/feed/','https://t.co/abc123','https://www.producthunt.com/','',''];
const UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
];
const COUNTRIES = ['GB','GB','GB','US','US','DE','FR','NL','IE','ES','AU','CA'];

const TAG_SEED = [
  { name: 'Hot lead', color: 'red' },
  { name: 'Newsletter', color: 'blue' },
  { name: 'Demo requested', color: 'violet' },
  { name: 'Enterprise', color: 'amber' },
  { name: 'Follow up', color: 'green' },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const chance = (p: number) => Math.random() < p;

function weightedSource() {
  const total = SOURCES.reduce((s, x) => s + x.weight, 0);
  let roll = Math.random() * total;
  for (const s of SOURCES) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return SOURCES[0]!;
}

const DAY = 86_400_000;
const NOW = Date.now();
const DAYS = 90;

/**
 * Submission volume over time: a gentle upward trend, a weekday/weekend rhythm,
 * and one launch spike — so the charts look like a real product, not noise.
 */
function volumeForDay(daysAgo: number): number {
  const t = (DAYS - daysAgo) / DAYS;
  const trend = 3 + t * 9;
  const dow = new Date(NOW - daysAgo * DAY).getUTCDay();
  const weekday = dow === 0 || dow === 6 ? 0.45 : 1;
  const spike = daysAgo >= 40 && daysAgo <= 43 ? 4.5 : 1;
  const noise = 0.6 + Math.random() * 0.8;
  return Math.max(0, Math.round(trend * weekday * spike * noise));
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const defaultSettings = (overrides: Partial<FormSettings> = {}): FormSettings => ({
  redirectUrl: null,
  successMessage: 'Thanks — you are on the list.',
  themeColor: '#4f46e5',
  honeypotName: 'company_website',
  allowedOrigins: [],
  ...overrides,
});

const EMAIL_FIELD: FormField = { key: 'email', label: 'Email address', type: 'email', required: true, placeholder: 'you@company.com' };
const NAME_FIELD: FormField = { key: 'name', label: 'Full name', type: 'text', required: false, placeholder: 'Jane Bennett' };

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

console.log('Seeding Mail Catcher…');

sqlite.transaction(() => {
  // Wipe in FK-safe order so `npm run seed` is repeatable.
  db.delete(contactTags).run();
  db.delete(submissions).run();
  db.delete(formStats).run();
  db.delete(contacts).run();
  db.delete(forms).run();
  db.delete(tags).run();
  db.delete(segments).run();
  db.delete(rateHits).run();

  /* -- Forms ---------------------------------------------------------- */
  const formDefs = [
    {
      name: 'Homepage newsletter',
      slug: 'homepage-newsletter',
      weight: 45,
      fields: [EMAIL_FIELD],
      settings: defaultSettings({ successMessage: 'Welcome aboard — check your inbox.' }),
    },
    {
      name: 'Pricing page — request a demo',
      slug: 'pricing-demo',
      weight: 35,
      fields: [
        EMAIL_FIELD,
        NAME_FIELD,
        { key: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Acme Ltd' },
        { key: 'team_size', label: 'Team size', type: 'select', required: false, options: ['1–10', '11–50', '51–200', '200+'] },
      ] satisfies FormField[],
      settings: defaultSettings({
        successMessage: 'Thanks — we will be in touch within one working day.',
        themeColor: '#0891b2',
        honeypotName: 'alternate_email',
      }),
    },
    {
      name: 'Ebook download',
      slug: 'ebook-download',
      weight: 20,
      fields: [EMAIL_FIELD, NAME_FIELD, { key: 'role', label: 'Your role', type: 'text', required: false }] satisfies FormField[],
      settings: defaultSettings({
        redirectUrl: 'https://example.com/thanks',
        themeColor: '#7c3aed',
        honeypotName: 'office_phone',
      }),
    },
  ];

  const formRows = formDefs.map((def) => {
    const id = newFormId();
    db.insert(forms)
      .values({
        id,
        name: def.name,
        slug: def.slug,
        status: 'active',
        fields: def.fields,
        settings: def.settings,
        createdAt: new Date(NOW - DAYS * DAY),
        updatedAt: new Date(NOW - DAYS * DAY),
      })
      .run();
    return { id, ...def };
  });

  const formTotal = formRows.reduce((s, f) => s + f.weight, 0);
  const pickForm = () => {
    let roll = Math.random() * formTotal;
    for (const f of formRows) {
      roll -= f.weight;
      if (roll <= 0) return f;
    }
    return formRows[0]!;
  };

  /* -- Tags ----------------------------------------------------------- */
  const tagRows = TAG_SEED.map((t) => {
    const id = newId();
    db.insert(tags).values({ id, name: t.name, color: t.color }).run();
    return { id, ...t };
  });

  /* -- Contacts + submissions ----------------------------------------- */
  const byEmail = new Map<string, { id: string; count: number; firstFormId: string; firstSeen: number; name: string }>();
  let submissionCount = 0;
  let spamCount = 0;
  const statCounter = new Map<string, { submits: number; spam: number; views: number }>();

  const bump = (formId: string, day: string, key: 'submits' | 'spam' | 'views', by = 1) => {
    const k = `${formId}|${day}`;
    const entry = statCounter.get(k) ?? { submits: 0, spam: 0, views: 0 };
    entry[key] += by;
    statCounter.set(k, entry);
  };

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const count = volumeForDay(daysAgo);

    for (let i = 0; i < count; i++) {
      const form = pickForm();
      // Spread submissions across the working day rather than clustering at midnight.
      const at = NOW - daysAgo * DAY + (8 + Math.random() * 12) * 3_600_000;
      if (at > NOW) continue;
      const day = utcDay(at);

      const first = pick(FIRST);
      const last = pick(LAST);
      // ~12% of submissions are a returning contact, which is what exercises the
      // "one contact, many submissions" model.
      const returning = byEmail.size > 20 && chance(0.12);
      const existingEmail = returning ? pick([...byEmail.keys()]) : null;
      const email = existingEmail ?? `${first.toLowerCase()}.${last.toLowerCase()}${chance(0.3) ? Math.floor(Math.random() * 90) + 10 : ''}@${pick(DOMAINS)}`;

      const src = weightedSource();
      const company = pick(COMPANIES);
      // A returning contact submits under the name we already know them by,
      // otherwise the timeline shows one person under several names.
      const knownName = existingEmail ? byEmail.get(existingEmail)?.name : undefined;
      const name = knownName ?? `${first} ${last}`;

      const payload: Record<string, string> = { email, name };
      if (form.slug === 'pricing-demo') {
        if (company) payload.company = company;
        if (chance(0.7)) payload.team_size = pick(['1–10', '11–50', '51–200', '200+']);
      }
      if (form.slug === 'ebook-download' && chance(0.6)) {
        payload.role = pick(['Founder', 'Marketing lead', 'Engineer', 'Designer', 'Operations']);
      }

      let contactId: string;
      const existing = byEmail.get(email);

      if (existing) {
        contactId = existing.id;
        existing.count += 1;
        db.update(contacts)
          .set({ lastSeenAt: new Date(at), submissionCount: existing.count, updatedAt: new Date(at) })
          .where(eq(contacts.id, contactId))
          .run();
      } else {
        contactId = newId();
        db.insert(contacts)
          .values({
            id: contactId,
            email,
            name,
            phone: chance(0.15) ? `+44 7${Math.floor(Math.random() * 900 + 100)} ${Math.floor(Math.random() * 900000 + 100000)}` : null,
            company: form.slug === 'pricing-demo' ? company : chance(0.2) ? company : null,
            data: payload.role ? { role: payload.role } : payload.team_size ? { team_size: payload.team_size } : {},
            status: chance(0.04) ? 'unsubscribed' : 'subscribed',
            notes: chance(0.08) ? pick(['Asked about annual billing.', 'Referred by an existing customer.', 'Wants a migration call.', 'Evaluating against a competitor.']) : null,
            firstFormId: form.id,
            firstSeenAt: new Date(at),
            lastSeenAt: new Date(at),
            submissionCount: 1,
            createdAt: new Date(at),
            updatedAt: new Date(at),
          })
          .run();
        byEmail.set(email, { id: contactId, count: 1, firstFormId: form.id, firstSeen: at, name });
      }

      const campaign = src.campaigns.length ? pick(src.campaigns) : '';
      db.insert(submissions)
        .values({
          id: newId(),
          contactId,
          formId: form.id,
          payload,
          utmSource: src.source || null,
          utmMedium: src.medium || null,
          utmCampaign: campaign || null,
          utmTerm: null,
          utmContent: null,
          referrer: pick(REFERRERS) || null,
          landingPageUrl: `https://example.com/${form.slug}${src.source ? `?utm_source=${src.source}&utm_medium=${src.medium}` : ''}`,
          userAgent: pick(UAS),
          ipHash: hashIp(`203.0.113.${Math.floor(Math.random() * 254) + 1}`),
          country: pick(COUNTRIES),
          isSpam: false,
          createdAt: new Date(at),
        })
        .run();

      submissionCount++;
      bump(form.id, day, 'submits');
      // Roughly a 6% conversion rate on views.
      bump(form.id, day, 'views', Math.max(1, Math.round(1 / 0.06 + (Math.random() * 8 - 4))));
    }

    // A trickle of blocked spam, so the "spam blocked" tile is not always zero.
    if (chance(0.55)) {
      const form = pickForm();
      const at = NOW - daysAgo * DAY + Math.random() * DAY;
      if (at <= NOW) {
        const n = Math.floor(Math.random() * 4) + 1;
        for (let i = 0; i < n; i++) {
          spamCount++;
          bump(form.id, utcDay(at), 'spam');
        }
      }
    }
  }

  /* -- Spam sentinel + rows -------------------------------------------- */
  const sentinelId = newId();
  db.insert(contacts)
    .values({
      id: sentinelId,
      email: 'spam@mailcatcher.invalid',
      name: 'Blocked spam',
      data: {},
      status: 'unsubscribed',
      firstSeenAt: new Date(NOW - DAYS * DAY),
      lastSeenAt: new Date(NOW),
      submissionCount: 0,
    })
    .run();

  for (const [key, stat] of statCounter) {
    if (!stat.spam) continue;
    const [formId, day] = key.split('|') as [string, string];
    for (let i = 0; i < stat.spam; i++) {
      db.insert(submissions)
        .values({
          id: newId(),
          contactId: sentinelId,
          formId,
          payload: { email: `bot${Math.floor(Math.random() * 9999)}@spam-domain.xyz`, name: 'Cheap SEO services' },
          userAgent: 'python-requests/2.31.0',
          ipHash: hashIp(`198.51.100.${Math.floor(Math.random() * 254) + 1}`),
          isSpam: true,
          spamReason: pick(['honeypot', 'token:too-fast', 'disposable_email', 'honeypot']),
          createdAt: new Date(new Date(day).getTime() + Math.random() * DAY),
        })
        .run();
    }
  }

  /* -- Daily rollups ---------------------------------------------------- */
  for (const [key, stat] of statCounter) {
    const [formId, day] = key.split('|') as [string, string];
    db.insert(formStats).values({ formId, day, views: stat.views, submits: stat.submits, spam: stat.spam }).run();
  }

  /* -- Tag assignment --------------------------------------------------- */
  const contactIds = [...byEmail.values()].map((c) => c.id);
  for (const contactId of contactIds) {
    if (!chance(0.35)) continue;
    const howMany = chance(0.25) ? 2 : 1;
    const chosen = new Set<string>();
    while (chosen.size < howMany) chosen.add(pick(tagRows).id);
    for (const tagId of chosen) {
      db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing().run();
    }
  }

  /* -- Saved segments ---------------------------------------------------- */
  db.insert(segments)
    .values([
      { id: newId(), name: 'Demo requests', filter: { formIds: [formRows[1]!.id] } },
      { id: newId(), name: 'Hot leads', filter: { tagIds: [tagRows[0]!.id] } },
      { id: newId(), name: 'Unsubscribed', filter: { status: 'unsubscribed' } },
    ])
    .run();

  console.log(`  ${byEmail.size} contacts`);
  console.log(`  ${submissionCount} submissions`);
  console.log(`  ${spamCount} spam blocked`);
  console.log(`  ${formRows.length} forms, ${tagRows.length} tags`);
})();

rebuildContactsFts(sqlite);

console.log('✓ Seed complete');
sqlite.close();
