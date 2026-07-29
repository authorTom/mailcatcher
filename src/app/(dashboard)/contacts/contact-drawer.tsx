'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  Building2,
  Calendar,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Avatar } from '@/components/dashboard/avatar';
import { StatusBadge, TagBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from '@/components/ui/dropdown';
import { Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { tagColor } from '@/lib/constants';
import type { ContactDetail } from '@/lib/queries/contacts';
import { formatDateTime, formatRelative, sentenceCase } from '@/lib/utils';
import { addTag, removeTag, setContactStatus, updateNotes } from './actions';

type TagOption = { id: string; name: string; color: string };

export function ContactDrawer({
  detail,
  allTags,
}: {
  detail: ContactDetail | null;
  allTags: TagOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function close() {
    const query = new URLSearchParams(params.toString());
    query.delete('contact');
    router.push(query.size ? `?${query}` : '?', { scroll: false });
  }

  return (
    <Dialog.Root open={Boolean(detail)} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--border)] bg-surface shadow-2xl focus:outline-none">
          {detail && <DrawerBody detail={detail} allTags={allTags} onClose={close} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrawerBody({
  detail,
  allTags,
  onClose,
}: {
  detail: ContactDetail;
  allTags: TagOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { contact, tags, submissions } = detail;
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(contact.notes ?? '');
  const [dirty, setDirty] = useState(false);

  // Reset when the drawer switches to a different contact.
  useEffect(() => {
    setNotes(contact.notes ?? '');
    setDirty(false);
  }, [contact.id, contact.notes]);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? 'Saved');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong');
      }
    });
  }

  const untagged = allTags.filter((t) => !tags.some((applied) => applied.id === t.id));

  return (
    <>
      <div className="flex items-start gap-3 border-b border-[var(--border)] p-5">
        <Avatar name={contact.name} email={contact.email} size="lg" />
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-base font-semibold tracking-tight">
            {contact.name ?? contact.email}
          </Dialog.Title>
          <Dialog.Description className="sr-only">Contact details and submission history</Dialog.Description>
          <a
            href={`mailto:${contact.email}`}
            className="mt-0.5 block truncate text-sm text-brand hover:underline"
          >
            {contact.email}
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={contact.status} />
            <span className="text-xs text-subtle">
              {contact.submissionCount} submission{contact.submissionCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close">
            <X />
          </Button>
        </Dialog.Close>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Details */}
        <section className="border-b border-[var(--border)] p-5">
          <dl className="space-y-2.5">
            <Detail icon={Mail} label="Email" value={contact.email} />
            {contact.phone && <Detail icon={Phone} label="Phone" value={contact.phone} />}
            {contact.company && <Detail icon={Building2} label="Company" value={contact.company} />}
            <Detail icon={Calendar} label="First seen" value={formatDateTime(contact.firstSeenAt)} />
            <Detail icon={Calendar} label="Last seen" value={formatDateTime(contact.lastSeenAt)} />
            {Object.entries(contact.data).map(([key, value]) => (
              <Detail key={key} icon={Globe} label={sentenceCase(key)} value={value} />
            ))}
          </dl>
        </section>

        {/* Tags */}
        <section className="border-b border-[var(--border)] p-5">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">Tags</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <TagBadge
                key={tag.id}
                name={tag.name}
                color={tag.color}
                onRemove={() => run(() => removeTag([contact.id], tag.id))}
              />
            ))}

            {untagged.length > 0 && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={pending}>
                    <Plus />
                    Add tag
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownLabel>Apply a tag</DropdownLabel>
                  {untagged.map((tag) => (
                    <DropdownItem key={tag.id} onSelect={() => run(() => addTag([contact.id], tag.id))}>
                      <span className="size-2 rounded-full" style={{ backgroundColor: tagColor(tag.color).dot }} />
                      {tag.name}
                    </DropdownItem>
                  ))}
                </DropdownContent>
              </Dropdown>
            )}

            {tags.length === 0 && untagged.length === 0 && (
              <p className="text-sm text-subtle">No tags exist yet.</p>
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="border-b border-[var(--border)] p-5">
          <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">Notes</h3>
          <Textarea
            rows={3}
            value={notes}
            placeholder="Anything worth remembering about this person…"
            onChange={(event) => {
              setNotes(event.target.value);
              setDirty(true);
            }}
          />
          {dirty && (
            <div className="mt-2 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await updateNotes(contact.id, notes);
                    if (result.ok) {
                      toast.success('Notes saved.');
                      setDirty(false);
                      router.refresh();
                    } else {
                      toast.error(result.error);
                    }
                  })
                }
              >
                {pending && <Loader2 className="animate-spin" />}
                Save notes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNotes(contact.notes ?? '');
                  setDirty(false);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </section>

        {/* Submission timeline */}
        <section className="p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">
            Submission history
          </h3>
          <ol className="space-y-3">
            {submissions.map((submission, index) => (
              <li key={submission.id} className="relative pl-5">
                {/* Timeline rail */}
                <span
                  className="absolute left-[3px] top-1.5 size-2 rounded-full bg-brand"
                  aria-hidden="true"
                />
                {index < submissions.length - 1 && (
                  <span
                    className="absolute bottom-[-14px] left-[6.5px] top-4 w-px bg-[var(--border)]"
                    aria-hidden="true"
                  />
                )}

                <div className="rounded-lg border border-[var(--border)] bg-subtle p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{submission.formName}</p>
                    <time
                      className="text-xs text-subtle"
                      dateTime={new Date(submission.createdAt).toISOString()}
                      title={formatDateTime(submission.createdAt)}
                    >
                      {formatRelative(submission.createdAt)}
                    </time>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {submission.utmSource && (
                      <Meta>
                        {submission.utmSource}
                        {submission.utmMedium ? ` / ${submission.utmMedium}` : ''}
                      </Meta>
                    )}
                    {submission.utmCampaign && <Meta>{submission.utmCampaign}</Meta>}
                    {submission.country && (
                      <Meta>
                        <MapPin className="size-3" />
                        {submission.country}
                      </Meta>
                    )}
                  </div>

                  {Object.keys(submission.payload).length > 0 && (
                    <dl className="mt-2.5 space-y-1 border-t border-[var(--border)] pt-2.5">
                      {Object.entries(submission.payload)
                        .filter(([key]) => !key.startsWith('_'))
                        .map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-xs">
                            <dt className="w-24 shrink-0 truncate text-subtle">{sentenceCase(key)}</dt>
                            <dd className="min-w-0 flex-1 break-words text-muted">{value}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] p-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              setContactStatus([contact.id], contact.status === 'subscribed' ? 'unsubscribed' : 'subscribed'),
            )
          }
        >
          {contact.status === 'subscribed' ? 'Mark unsubscribed' : 'Mark subscribed'}
        </Button>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <a href={`mailto:${contact.email}`}>
            <Mail />
            Email
          </a>
        </Button>
      </div>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" />
      <dt className="w-24 shrink-0 text-xs text-subtle">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm">{value}</dd>
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-surface px-1.5 py-0.5 text-[11px] text-muted">
      {children}
    </span>
  );
}
