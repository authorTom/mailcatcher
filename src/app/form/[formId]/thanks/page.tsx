import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getForm } from '@/lib/forms';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ formId: string }> };

export const metadata: Metadata = { title: 'Thank you', robots: { index: false, follow: false } };

export default async function ThanksPage({ params }: Props) {
  const { formId } = await params;
  const form = getForm(formId);

  if (!form) notFound();

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-subtle p-4"
      style={{ ['--form-accent' as string]: form.settings.themeColor }}
    >
      <div className="card w-full max-w-md p-8 text-center">
        <div
          className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--form-accent)' }}
        >
          <Check className="size-6 text-white" strokeWidth={3} />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{form.settings.successMessage}</h1>
        <p className="mt-2 text-sm text-muted">You can close this page.</p>
      </div>
    </main>
  );
}
