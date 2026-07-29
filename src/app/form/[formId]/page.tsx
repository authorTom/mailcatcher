import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { issueFormToken } from '@/lib/crypto';
import { getForm } from '@/lib/forms';
import { recordFormView } from '@/lib/ingest';
import type { FormField } from '@/db/schema';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ formId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { formId } = await params;
  const form = getForm(formId);
  return { title: form?.name ?? 'Form', robots: { index: false, follow: false } };
}

export default async function HostedFormPage({ params }: Props) {
  const { formId } = await params;
  const form = getForm(formId);

  if (!form) notFound();

  if (form.status !== 'active') {
    return (
      <Shell themeColor={form.settings.themeColor}>
        <h1 className="text-lg font-semibold">This form is closed</h1>
        <p className="mt-2 text-sm text-muted">It is no longer accepting submissions.</p>
      </Shell>
    );
  }

  recordFormView(form.id);
  const token = issueFormToken();

  return (
    <Shell themeColor={form.settings.themeColor}>
      <h1 className="text-xl font-semibold tracking-tight">{form.name}</h1>

      {/* No JS required: a plain POST that the endpoint answers with a 303. */}
      <form method="POST" action={`/f/${form.id}`} className="mt-6 space-y-4">
        <input type="hidden" name="_ts" value={token} />

        {/* Trap field — positioned off-screen rather than display:none. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <input type="text" name={form.settings.honeypotName} tabIndex={-1} autoComplete="off" />
        </div>

        {form.fields.map((field) => (
          <Field key={field.key} field={field} />
        ))}

        <button
          type="submit"
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: 'var(--form-accent)' }}
        >
          Submit
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-subtle">
        Protected by Mail Catcher. We never share your details.
      </p>
    </Shell>
  );
}

function Field({ field }: { field: FormField }) {
  const id = `field-${field.key}`;
  const base =
    'w-full rounded-lg border px-3 py-2.5 text-sm bg-surface text-default placeholder:text-subtle ' +
    'transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--form-accent)]/40 focus:border-[var(--form-accent)]';

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {field.label}
        {field.required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {field.type === 'textarea' ? (
        <textarea id={id} name={field.key} required={field.required} placeholder={field.placeholder} rows={4} className={base} />
      ) : field.type === 'select' ? (
        <select id={id} name={field.key} required={field.required} defaultValue="" className={base}>
          <option value="" disabled>
            Choose…
          </option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <div className="flex items-center gap-2">
          <input id={id} type="checkbox" name={field.key} required={field.required} value="yes" className="size-4 rounded" />
          <label htmlFor={id} className="text-sm text-muted">
            {field.placeholder ?? 'Yes'}
          </label>
        </div>
      ) : (
        <input
          id={id}
          type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
          name={field.key}
          required={field.required}
          placeholder={field.placeholder}
          autoComplete={autoCompleteFor(field.key)}
          className={base}
        />
      )}
    </div>
  );
}

function autoCompleteFor(key: string): string | undefined {
  const map: Record<string, string> = {
    email: 'email',
    name: 'name',
    first_name: 'given-name',
    last_name: 'family-name',
    phone: 'tel',
    company: 'organization',
  };
  return map[key];
}

function Shell({ themeColor, children }: { themeColor: string; children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-subtle p-4"
      style={{ ['--form-accent' as string]: themeColor }}
    >
      <div className="card w-full max-w-md p-6 sm:p-8">{children}</div>
    </main>
  );
}
