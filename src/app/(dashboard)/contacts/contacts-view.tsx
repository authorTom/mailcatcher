'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Trash2,
  UserMinus,
  UserCheck,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Avatar } from '@/components/dashboard/avatar';
import { StatusBadge, TagBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { toast } from '@/components/ui/toaster';
import { tagColor } from '@/lib/constants';
import type { ContactDetail, ContactRow } from '@/lib/queries/contacts';
import type { Segment } from '@/db/schema';
import { cn, formatNumber, formatRelative } from '@/lib/utils';
import {
  addTag,
  deleteContacts,
  removeTag,
  selectAllMatching,
  setContactStatus,
} from './actions';
import { ContactDrawer } from './contact-drawer';
import { FilterBar } from './filter-bar';
import { SaveSegmentDialog } from './save-segment-dialog';
import { useFilters } from './use-filters';

type TagOption = { id: string; name: string; color: string; count: number };

export function ContactsView({
  rows,
  total,
  page,
  pageSize,
  allTags,
  allForms,
  segments,
  detail,
}: {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  allTags: TagOption[];
  allForms: { id: string; name: string }[];
  segments: Segment[];
  detail: ContactDetail | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { apply } = useFilters();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) for (const id of pageIds) next.delete(id);
      else for (const id of pageIds) next.add(id);
      return next;
    });
  }

  function currentFilters() {
    return {
      search: params.get('q') ?? undefined,
      tagIds: params.getAll('tag'),
      formIds: params.getAll('form'),
      status: (params.get('status') as 'subscribed' | 'unsubscribed' | null) ?? undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    };
  }

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, clear = true) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? 'Done');
        if (clear) setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong');
      }
    });
  }

  function selectEverything() {
    startTransition(async () => {
      const ids = await selectAllMatching(currentFilters());
      setSelected(new Set(ids));
    });
  }

  function goToPage(next: number) {
    const query = new URLSearchParams(params.toString());
    if (next <= 1) query.delete('page');
    else query.set('page', String(next));
    router.push(query.size ? `?${query}` : '?', { scroll: true });
  }

  /** Export honours the active filters — you get exactly what the table shows. */
  function exportUrl(scope: 'filtered' | 'selected') {
    const query = new URLSearchParams(params.toString());
    query.delete('page');
    query.delete('contact');
    if (scope === 'selected') {
      query.delete('q');
      for (const key of ['tag', 'form', 'status', 'from', 'to']) query.delete(key);
      for (const id of selected) query.append('id', id);
    }
    return `/api/export/contacts?${query}`;
  }

  return (
    <div className="space-y-4">
      <FilterBar
        allTags={allTags}
        allForms={allForms}
        segments={segments}
        onSaveSegment={() => setSaveOpen(true)}
      />

      {/* Bulk action bar — appears only when something is selected. */}
      {someSelected && (
        <div className="sticky top-[3.75rem] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand bg-brand-subtle px-3 py-2.5">
          <span className="text-sm font-medium">
            {formatNumber(selected.size)} selected
          </span>

          {allOnPageSelected && selected.size < total && (
            <button
              type="button"
              onClick={selectEverything}
              className="text-sm font-medium text-brand underline underline-offset-2"
            >
              Select all {formatNumber(total)} matching
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="secondary" size="sm" disabled={pending}>
                  <Plus />
                  Tag
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownLabel>Add a tag</DropdownLabel>
                {allTags.length === 0 && <DropdownItem disabled>No tags yet</DropdownItem>}
                {allTags.map((tag) => (
                  <DropdownItem key={tag.id} onSelect={() => run(() => addTag([...selected], tag.id))}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: tagColor(tag.color).dot }} />
                    {tag.name}
                  </DropdownItem>
                ))}
                {allTags.length > 0 && (
                  <>
                    <DropdownSeparator />
                    <DropdownLabel>Remove a tag</DropdownLabel>
                    {allTags.map((tag) => (
                      <DropdownItem key={`rm-${tag.id}`} onSelect={() => run(() => removeTag([...selected], tag.id))}>
                        <span className="size-2 rounded-full opacity-50" style={{ backgroundColor: tagColor(tag.color).dot }} />
                        {tag.name}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </DropdownContent>
            </Dropdown>

            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setContactStatus([...selected], 'unsubscribed'))}
            >
              <UserMinus />
              Unsubscribe
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setContactStatus([...selected], 'subscribed'))}
            >
              <UserCheck />
              Resubscribe
            </Button>

            <Button asChild variant="secondary" size="sm">
              <a href={exportUrl('selected')}>
                <Download />
                Export
              </a>
            </Button>

            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete ${selected.size} contact${selected.size === 1 ? '' : 's'}? This also removes their submissions and cannot be undone.`)) return;
                run(() => deleteContacts([...selected]));
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </div>
        </div>
      )}

      {!someSelected && (
        <div className="flex justify-end">
          <Button asChild variant="secondary" size="sm">
            <a href={exportUrl('filtered')}>
              <Download />
              Export {total === 0 ? '' : formatNumber(total)} to CSV
            </a>
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-subtle">
            No contacts match these filters.{' '}
            <button type="button" onClick={() => apply((q) => [...q.keys()].forEach((k) => q.delete(k)))} className="text-brand underline underline-offset-2">
              Clear filters
            </button>
          </p>
        ) : (
          <>
            {/* Desktop: a table. */}
            <div className="hidden overflow-x-auto md:block">
              {/* Fixed layout so `truncate` has a definite width to work against —
                  with auto layout the browser sizes columns to content and the
                  ellipsis never kicks in predictably. */}
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th scope="col" className="w-12 px-4 py-2.5">
                      <Checkbox
                        checked={allOnPageSelected ? true : selected.size > 0 && pageIds.some((id) => selected.has(id)) ? 'indeterminate' : false}
                        onCheckedChange={toggleAllOnPage}
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th scope="col" className="w-[30%] px-3 py-2.5 text-xs font-medium text-muted">Contact</th>
                    <th scope="col" className="w-[20%] px-3 py-2.5 text-xs font-medium text-muted">Tags</th>
                    <th scope="col" className="w-[18%] px-3 py-2.5 text-xs font-medium text-muted">Source form</th>
                    <th scope="col" className="w-16 px-3 py-2.5 text-right text-xs font-medium text-muted">Subs</th>
                    <th scope="col" className="w-32 px-3 py-2.5 text-xs font-medium text-muted">Status</th>
                    <th scope="col" className="w-28 px-4 py-2.5 text-right text-xs font-medium text-muted">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn('transition-colors hover:bg-surface-hover', selected.has(row.id) && 'bg-brand-subtle/40')}
                    >
                      <td className="px-4 py-2.5">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.email}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => openContact(router, params, row.id)}
                          className="flex w-full min-w-0 items-center gap-2.5 text-left"
                        >
                          <Avatar name={row.name} email={row.email} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{row.name ?? row.email}</span>
                            {row.name && <span className="block truncate text-xs text-muted">{row.email}</span>}
                            {!row.name && row.company && <span className="block truncate text-xs text-muted">{row.company}</span>}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {row.tags.slice(0, 2).map((tag) => (
                            <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                          ))}
                          {row.tags.length > 2 && (
                            <span className="text-xs text-subtle">+{row.tags.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="block truncate text-xs text-muted">{row.firstFormName ?? '—'}</span>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">{row.submissionCount}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted">{formatRelative(row.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: the same rows as cards, since a 7-column table cannot work at 375px. */}
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggleOne(row.id)}
                    aria-label={`Select ${row.email}`}
                    className="mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => openContact(router, params, row.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <Avatar name={row.name} email={row.email} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.name ?? row.email}</span>
                      {row.name && <span className="block truncate text-xs text-muted">{row.email}</span>}
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        {row.tags.slice(0, 2).map((tag) => (
                          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                        <span className="text-[11px] text-subtle">
                          {row.submissionCount} sub{row.submissionCount === 1 ? '' : 's'} · {formatRelative(row.lastSeenAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Page {page} of {totalPages} · {formatNumber(total)} contacts
          </p>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft />
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              Next
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <ContactDrawer detail={detail} allTags={allTags} />

      <SaveSegmentDialog open={saveOpen} onOpenChange={setSaveOpen} filters={currentFilters()} />
    </div>
  );
}

function openContact(
  router: ReturnType<typeof useRouter>,
  params: ReturnType<typeof useSearchParams>,
  id: string,
) {
  const query = new URLSearchParams(params.toString());
  query.set('contact', id);
  router.push(`?${query}`, { scroll: false });
}
