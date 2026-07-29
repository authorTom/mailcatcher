'use client';

import * as Tabs from '@radix-ui/react-tabs';
import {
  ExternalLink,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/dashboard/avatar';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import type { Form, FormField, FormSettings } from '@/db/schema';
import { cn, formatDateTime, formatPercent, formatRelative, sentenceCase } from '@/lib/utils';
import {
  deleteForm,
  rotateHoneypot,
  updateFormDetails,
  updateFormFields,
  updateFormSettings,
} from '../actions';

type Stats = { submissions: number; contacts: number; spam: number; views: number };
type Recent = {
  id: string;
  contactId: string;
  email: string;
  name: string | null;
  payload: Record<string, string>;
  utmSource: string | null;
  utmCampaign: string | null;
  createdAt: Date;
};
type Daily = { day: string; views: number; submits: number; spam: number };

const TABS = [
  { value: 'setup', label: 'Setup' },
  { value: 'fields', label: 'Fields' },
  { value: 'settings', label: 'Settings' },
  { value: 'submissions', label: 'Submissions' },
  { value: 'analytics', label: 'Analytics' },
];

export function FormDetail({
  form,
  origin,
  stats,
  recent,
  daily,
}: {
  form: Form;
  origin: string;
  stats: Stats;
  recent: Recent[];
  daily: Daily[];
}) {
  const conversion = stats.views > 0 ? (stats.submissions / stats.views) * 100 : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{form.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {origin}/f/{form.id}
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <a href={`${origin}/form/${form.id}`} target="_blank" rel="noreferrer">
            <ExternalLink />
            Preview hosted form
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Submissions" value={stats.submissions} hint="all time" />
        <StatTile label="Unique contacts" value={stats.contacts} />
        <StatTile
          label="Conversion rate"
          value={conversion == null ? '—' : formatPercent(conversion)}
          hint={conversion == null ? 'no views recorded' : `${stats.views.toLocaleString('en-GB')} views`}
        />
        <StatTile label="Spam blocked" value={stats.spam} invertDelta />
      </div>

      <Tabs.Root defaultValue="setup">
        <Tabs.List className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'relative whitespace-nowrap px-3 py-2.5 text-sm font-medium text-muted transition-colors',
                'hover:text-default data-[state=active]:text-brand',
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full',
                'data-[state=active]:after:bg-[var(--brand)]',
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="pt-5">
          <Tabs.Content value="setup">
            <SetupTab form={form} origin={origin} />
          </Tabs.Content>
          <Tabs.Content value="fields">
            <FieldsTab form={form} />
          </Tabs.Content>
          <Tabs.Content value="settings">
            <SettingsTab form={form} />
          </Tabs.Content>
          <Tabs.Content value="submissions">
            <SubmissionsTab recent={recent} />
          </Tabs.Content>
          <Tabs.Content value="analytics">
            <AnalyticsTab daily={daily} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Setup
 * ------------------------------------------------------------------ */

function SetupTab({ form, origin }: { form: Form; origin: string }) {
  const endpoint = `${origin}/f/${form.id}`;
  const fields = form.fields;

  const plainHtml = [
    `<form action="${endpoint}" method="POST">`,
    ...fields.map((field) => `  ${inputFor(field)}`),
    '',
    '  <!-- Spam trap: keep it hidden and leave it empty. -->',
    `  <div style="position:absolute;left:-9999px" aria-hidden="true">`,
    `    <input type="text" name="${form.settings.honeypotName}" tabindex="-1" autocomplete="off">`,
    '  </div>',
    '',
    '  <button type="submit">Subscribe</button>',
    '</form>',
  ].join('\n');

  const jsSnippet = [
    `<form data-mailcatcher="${form.id}">`,
    ...fields.map((field) => `  ${inputFor(field)}`),
    '',
    '  <button type="submit">Subscribe</button>',
    '  <p data-mc-message></p>',
    '</form>',
    '',
    `<script src="${origin}/embed.js" async></script>`,
  ].join('\n');

  const stateCss = [
    'form[data-mc-state="submitting"] button { opacity: .6; pointer-events: none; }',
    'form[data-mc-state="success"]    [data-mc-message] { color: green; }',
    'form[data-mc-state="error"]      [data-mc-message] { color: crimson; }',
  ].join('\n');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Your endpoint"
          description="Every method below posts here. Nothing else needs configuring."
        />
        <CardBody>
          <CodeBlock code={endpoint} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="1 · Plain HTML form"
          description="No JavaScript at all. The browser posts, we redirect to your thank-you page."
        />
        <CardBody className="space-y-3">
          <CodeBlock code={plainHtml} />
          <p className="text-xs text-muted">
            After submitting, visitors land on{' '}
            {form.settings.redirectUrl ? (
              <span className="font-mono">{form.settings.redirectUrl}</span>
            ) : (
              <span className="font-mono">/form/{form.id}/thanks</span>
            )}
            . Change that under Settings.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="2 · JavaScript embed"
          description="Inline success and errors with no page reload. Also captures UTM parameters automatically."
        />
        <CardBody className="space-y-3">
          <CodeBlock code={jsSnippet} />
          <CodeBlock
            code={stateCss}
            label="Styling the states"
            description="The script sets data-mc-state on the form; style it to match your page."
          />
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="3 · Hosted form"
          description="We render the form for you — nothing to add to your landing page."
        />
        <CardBody className="space-y-3">
          <CodeBlock code={`${origin}/form/${form.id}`} label="Link straight to it" />
          <CodeBlock
            code={`<iframe src="${origin}/form/${form.id}" width="100%" height="420" frameborder="0" title="${form.name}"></iframe>`}
            label="Or embed it in an iframe"
          />
        </CardBody>
      </Card>
    </div>
  );
}

function inputFor(field: FormField): string {
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : '';

  if (field.type === 'textarea') return `<textarea name="${field.key}"${placeholder}${required}></textarea>`;
  if (field.type === 'select') {
    const options = (field.options ?? []).map((o) => `<option>${o}</option>`).join('');
    return `<select name="${field.key}"${required}>${options}</select>`;
  }
  if (field.type === 'checkbox') return `<input type="checkbox" name="${field.key}" value="yes"${required}>`;

  return `<input type="${field.type}" name="${field.key}"${placeholder}${required}>`;
}

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

const FIELD_TYPES: FormField['type'][] = ['email', 'text', 'tel', 'textarea', 'select', 'checkbox'];

function FieldsTab({ form }: { form: Form }) {
  const router = useRouter();
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateFormFields(form.id, fields);
      if (result.ok) {
        toast.success(result.message ?? 'Saved');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Fields"
        description="These drive the hosted form and the copy-paste snippets. Your landing page can always post extra fields — they are stored automatically."
      />
      <CardBody className="space-y-3">
        {fields.map((field, index) => (
          <div key={index} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-0.5 pb-1.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="text-subtle transition-colors hover:text-default disabled:opacity-30"
                  aria-label="Move up"
                >
                  <GripVertical className="size-4 rotate-90" />
                </button>
              </div>

              <div className="min-w-[8rem] flex-1 space-y-1.5">
                <Label htmlFor={`label-${index}`}>Label</Label>
                <Input
                  id={`label-${index}`}
                  value={field.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
              </div>

              <div className="min-w-[7rem] space-y-1.5">
                <Label htmlFor={`key-${index}`}>Key</Label>
                <Input
                  id={`key-${index}`}
                  value={field.key}
                  disabled={field.key === 'email'}
                  onChange={(event) => update(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  className="font-mono text-xs"
                />
              </div>

              <div className="min-w-[7rem] space-y-1.5">
                <Label htmlFor={`type-${index}`}>Type</Label>
                <Select
                  id={`type-${index}`}
                  value={field.type}
                  disabled={field.key === 'email'}
                  onChange={(event) => update(index, { type: event.target.value as FormField['type'] })}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>

              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  disabled={field.key === 'email'}
                  onChange={(event) => update(index, { required: event.target.checked })}
                  className="size-4 rounded"
                />
                Required
              </label>

              <Button
                variant="ghost"
                size="icon"
                disabled={field.key === 'email'}
                onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Remove ${field.label}`}
                className="mb-1"
              >
                <Trash2 />
              </Button>
            </div>

            {field.type === 'select' && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor={`options-${index}`}>Options (one per line)</Label>
                <Textarea
                  id={`options-${index}`}
                  rows={3}
                  value={(field.options ?? []).join('\n')}
                  onChange={(event) =>
                    update(index, { options: event.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })
                  }
                />
              </div>
            )}

            {field.key === 'email' && (
              <p className="mt-2 text-xs text-subtle">
                The email field is fixed — it is what identifies a contact and powers de-duplication.
              </p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setFields((prev) => [
                ...prev,
                { key: `field_${prev.length + 1}`, label: 'New field', type: 'text', required: false },
              ])
            }
          >
            <Plus />
            Add field
          </Button>
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save fields
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function SettingsTab({ form }: { form: Form }) {
  const router = useRouter();
  const [name, setName] = useState(form.name);
  const [status, setStatus] = useState(form.status);
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [origins, setOrigins] = useState((form.settings.allowedOrigins ?? []).join('\n'));
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result?.ok) {
        toast.success(result.message ?? 'Saved');
        router.refresh();
      } else if (result) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="General" />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Name</Label>
            <Input id="form-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="form-status">Status</Label>
            <Select
              id="form-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="active">Active — accepting submissions</option>
              <option value="paused">Paused — rejects with a clear message</option>
              <option value="archived">Archived — hidden from the forms list</option>
            </Select>
          </div>

          <Button variant="primary" disabled={pending} onClick={() => run(() => updateFormDetails(form.id, { name, status }))}>
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="After submitting" description="What the person sees once they have signed up." />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="success-message">Success message</Label>
            <Input
              id="success-message"
              value={settings.successMessage}
              onChange={(event) => setSettings((s) => ({ ...s, successMessage: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redirect-url">Redirect URL (optional)</Label>
            <Input
              id="redirect-url"
              type="url"
              placeholder="https://example.com/thank-you"
              value={settings.redirectUrl ?? ''}
              onChange={(event) => setSettings((s) => ({ ...s, redirectUrl: event.target.value || null }))}
            />
            <p className="text-xs text-muted">Leave blank to use the built-in thank-you page.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="theme-color">Theme colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="theme-color"
                type="color"
                value={settings.themeColor}
                onChange={(event) => setSettings((s) => ({ ...s, themeColor: event.target.value }))}
                className="size-9 cursor-pointer rounded-lg border border-[var(--border)] bg-surface p-1"
              />
              <Input
                value={settings.themeColor}
                onChange={(event) => setSettings((s) => ({ ...s, themeColor: event.target.value }))}
                className="max-w-[8rem] font-mono text-xs"
              />
            </div>
          </div>

          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              run(() =>
                updateFormSettings(form.id, {
                  ...settings,
                  allowedOrigins: origins.split('\n').map((o) => o.trim()).filter(Boolean),
                }),
              )
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Spam & security"
          description="These run on every submission. Nothing here asks your visitors to prove they are human."
        />
        <CardBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="allowed-origins">Allowed origins (one per line)</Label>
            <Textarea
              id="allowed-origins"
              rows={3}
              value={origins}
              placeholder={'https://example.com\n*.staging.example.com'}
              onChange={(event) => setOrigins(event.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted">
              Leave empty to accept from anywhere. Once you list an origin, browser submissions from
              anywhere else are refused. A wildcard like <code className="font-mono">*.example.com</code>{' '}
              covers subdomains.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Honeypot field</p>
                <p className="text-xs text-muted">
                  Hidden trap field: <code className="font-mono">{form.settings.honeypotName}</code>
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => rotateHoneypot(form.id))}
              >
                <RefreshCw />
                Rotate
              </Button>
            </div>
          </div>

          <ul className="space-y-1.5 text-xs text-muted">
            <li>· Time trap — submissions faster than 2 seconds are treated as bots.</li>
            <li>· Rate limit — 5 per form per 10 minutes, 30 per hour overall, per IP.</li>
            <li>· Disposable-address blocklist and server-side email validation.</li>
          </ul>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2 border-[var(--danger)]/30">
        <CardHeader title="Danger zone" description="Deleting a form also deletes its submissions. Contacts are kept." />
        <CardBody>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete “${form.name}”? Its submissions go too. Contacts captured by it are kept.`)) return;
              run(() => deleteForm(form.id));
            }}
          >
            <Trash2 />
            Delete this form
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Submissions & analytics
 * ------------------------------------------------------------------ */

function SubmissionsTab({ recent }: { recent: Recent[] }) {
  if (recent.length === 0) {
    return (
      <Card>
        <p className="px-6 py-14 text-center text-sm text-subtle">
          No submissions yet. Once your landing page posts here, they appear immediately.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Latest submissions" description="The 25 most recent, newest first." />
      <ul className="divide-y divide-[var(--border)]">
        {recent.map((submission) => (
          <li key={submission.id} className="px-5 py-3">
            <div className="flex items-start gap-3">
              <Avatar name={submission.name} email={submission.email} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/contacts?contact=${submission.contactId}`}
                  className="block truncate text-sm font-medium hover:text-brand"
                >
                  {submission.name ?? submission.email}
                </Link>
                {submission.name && <p className="truncate text-xs text-muted">{submission.email}</p>}

                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-subtle">
                  {Object.entries(submission.payload)
                    .filter(([key]) => !key.startsWith('_') && key !== 'email' && key !== 'name')
                    .slice(0, 4)
                    .map(([key, value]) => (
                      <span key={key}>
                        <span className="text-subtle">{sentenceCase(key)}:</span>{' '}
                        <span className="text-muted">{value}</span>
                      </span>
                    ))}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <time className="block text-xs text-muted" title={formatDateTime(submission.createdAt)}>
                  {formatRelative(submission.createdAt)}
                </time>
                {submission.utmSource && (
                  <span className="mt-0.5 block text-[11px] text-subtle">{submission.utmSource}</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AnalyticsTab({ daily }: { daily: Daily[] }) {
  const totals = daily.reduce(
    (acc, day) => ({
      views: acc.views + day.views,
      submits: acc.submits + day.submits,
      spam: acc.spam + day.spam,
    }),
    { views: 0, submits: 0, spam: 0 },
  );

  if (daily.length === 0) {
    return (
      <Card>
        <p className="px-6 py-14 text-center text-sm text-subtle">No activity in the last 30 days.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Last 30 days" description="Daily views, submissions and blocked spam." />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th scope="col" className="px-5 py-2.5 text-xs font-medium text-muted">Day</th>
              <th scope="col" className="px-5 py-2.5 text-right text-xs font-medium text-muted">Views</th>
              <th scope="col" className="px-5 py-2.5 text-right text-xs font-medium text-muted">Submissions</th>
              <th scope="col" className="px-5 py-2.5 text-right text-xs font-medium text-muted">Conversion</th>
              <th scope="col" className="px-5 py-2.5 text-right text-xs font-medium text-muted">Spam</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {[...daily].reverse().map((day) => (
              <tr key={day.day} className="transition-colors hover:bg-surface-hover">
                <td className="px-5 py-2 text-xs">{day.day}</td>
                <td className="tnum px-5 py-2 text-right">{day.views}</td>
                <td className="tnum px-5 py-2 text-right font-medium">{day.submits}</td>
                <td className="tnum px-5 py-2 text-right text-muted">
                  {day.views > 0 ? formatPercent((day.submits / day.views) * 100, 0) : '—'}
                </td>
                <td className="tnum px-5 py-2 text-right text-muted">{day.spam || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border)] bg-subtle font-medium">
              <td className="px-5 py-2.5 text-xs">Total</td>
              <td className="tnum px-5 py-2.5 text-right">{totals.views}</td>
              <td className="tnum px-5 py-2.5 text-right">{totals.submits}</td>
              <td className="tnum px-5 py-2.5 text-right">
                {totals.views > 0 ? formatPercent((totals.submits / totals.views) * 100, 1) : '—'}
              </td>
              <td className="tnum px-5 py-2.5 text-right">{totals.spam}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
