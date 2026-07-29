import { ArrowRight, Inbox, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { listForms } from '@/lib/forms';
import { getFormBreakdown } from '@/lib/queries/analytics';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import { NewFormButton } from './new-form-button';

export const metadata: Metadata = { title: 'Forms' };
export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  active: 'text-success',
  paused: 'text-warning',
  archived: 'text-subtle',
};

export default async function FormsPage() {
  const forms = listForms();
  const stats = new Map(getFormBreakdown('all').map((f) => [f.id, f]));

  if (forms.length === 0) {
    return (
      <>
        <PageHeader title="Forms" />
        <Card>
          <EmptyState
            icon={Inbox}
            title="No forms yet"
            description="A form gives you an endpoint URL. Point any landing page at it and submissions start arriving here."
            action={<NewFormButton />}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Forms" description="Each form is an endpoint your landing pages can post to.">
        <NewFormButton />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {forms.map((form) => {
          const stat = stats.get(form.id);

          return (
            <Card
              key={form.id}
              className="relative flex flex-col p-5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-sm font-semibold tracking-tight">
                  <Link href={`/forms/${form.id}`} className="hover:text-brand">
                    <span className="absolute inset-0" aria-hidden="true" />
                    {form.name}
                  </Link>
                </h2>
                <span className={cn('shrink-0 text-xs font-medium capitalize', STATUS_STYLES[form.status])}>
                  {form.status}
                </span>
              </div>

              <code className="mt-2 block truncate rounded bg-subtle px-2 py-1 text-[11px] text-muted">
                /f/{form.id}
              </code>

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3">
                <Stat label="Submissions" value={formatNumber(stat?.submissions ?? 0)} />
                <Stat label="Views" value={formatNumber(stat?.views ?? 0)} />
                <Stat
                  label="Conversion"
                  value={stat?.conversionRate == null ? '—' : formatPercent(stat.conversionRate, 0)}
                />
              </dl>

              <div className="relative mt-4 flex items-center gap-2 text-xs">
                <span className="text-subtle">{form.fields.length} field{form.fields.length === 1 ? '' : 's'}</span>
                <span className="ml-auto flex items-center gap-1 font-medium text-brand">
                  Setup
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="tnum mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}
