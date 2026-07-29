'use client';

import { Bookmark, ChevronDown, Inbox, Search, Tag as TagIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dropdown,
  DropdownCheckItem,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Input, Select } from '@/components/ui/input';
import { tagColor } from '@/lib/constants';
import type { Segment } from '@/db/schema';
import { cn } from '@/lib/utils';
import { useFilters } from './use-filters';

type Option = { id: string; name: string; color?: string; count?: number };

export function FilterBar({
  allTags,
  allForms,
  segments,
  onSaveSegment,
}: {
  allTags: Option[];
  allForms: Option[];
  segments: Segment[];
  onSaveSegment: () => void;
}) {
  const { get, getAll, setValue, toggleValue, clearAll, pending, apply } = useFilters();

  const selectedTags = getAll('tag');
  const selectedForms = getAll('form');
  const status = get('status');
  const search = get('q') ?? '';

  const activeCount =
    selectedTags.length + selectedForms.length + (status ? 1 : 0) + (search ? 1 : 0) + (get('from') ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Filters sit in one row above the content. */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(value) => setValue('q', value || null)} pending={pending} />

        <FilterMenu
          icon={TagIcon}
          label="Tags"
          selected={selectedTags}
          options={allTags}
          onToggle={(id) => toggleValue('tag', id)}
          onClear={() => apply((q) => q.delete('tag'))}
          renderDot={(option) => (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tagColor(option.color ?? 'slate').dot }}
            />
          )}
        />

        <FilterMenu
          icon={Inbox}
          label="Forms"
          selected={selectedForms}
          options={allForms}
          onToggle={(id) => toggleValue('form', id)}
          onClear={() => apply((q) => q.delete('form'))}
        />

        <Select
          value={status ?? ''}
          onChange={(event) => setValue('status', event.target.value || null)}
          className="h-9 w-auto"
          aria-label="Subscription status"
        >
          <option value="">Any status</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </Select>

        <Select
          value={get('sort') ?? 'recent'}
          onChange={(event) => setValue('sort', event.target.value === 'recent' ? null : event.target.value)}
          className="h-9 w-auto"
          aria-label="Sort order"
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
          <option value="submissions">Most submissions</option>
          <option value="email">Email A–Z</option>
        </Select>

        {segments.length > 0 && (
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="secondary" size="md">
                <Bookmark />
                Segments
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownLabel>Saved segments</DropdownLabel>
              {segments.map((segment) => (
                <DropdownItem key={segment.id} onSelect={() => applySegment(segment, apply)}>
                  <Bookmark className="size-3.5 text-subtle" />
                  {segment.name}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem onSelect={onSaveSegment} disabled={activeCount === 0}>
                Save current filters…
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        )}

        {activeCount > 0 && (
          <Button variant="ghost" size="md" onClick={clearAll}>
            <X />
            Clear
          </Button>
        )}

        {segments.length === 0 && activeCount > 0 && (
          <Button variant="ghost" size="md" onClick={onSaveSegment}>
            <Bookmark />
            Save segment
          </Button>
        )}
      </div>

      {/* Active filters as removable chips, so what is applied is never hidden
          behind a dropdown. */}
      {(selectedTags.length > 0 || selectedForms.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((id) => {
            const tag = allTags.find((t) => t.id === id);
            if (!tag) return null;
            return (
              <Chip key={id} onRemove={() => toggleValue('tag', id)}>
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: tagColor(tag.color ?? 'slate').dot }}
                />
                {tag.name}
              </Chip>
            );
          })}
          {selectedForms.map((id) => {
            const form = allForms.find((f) => f.id === id);
            if (!form) return null;
            return (
              <Chip key={id} onRemove={() => toggleValue('form', id)}>
                <Inbox className="size-3 text-subtle" />
                {form.name}
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}

function applySegment(segment: Segment, apply: (fn: (q: URLSearchParams) => void) => void) {
  apply((query) => {
    for (const key of ['q', 'tag', 'form', 'status', 'from', 'to']) query.delete(key);

    const filter = segment.filter;
    if (filter.search) query.set('q', filter.search);
    if (filter.status) query.set('status', filter.status);
    if (filter.from) query.set('from', filter.from);
    if (filter.to) query.set('to', filter.to);
    for (const id of filter.tagIds ?? []) query.append('tag', id);
    for (const id of filter.formIds ?? []) query.append('form', id);
  });
}

function SearchInput({
  value,
  onChange,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep in sync when the URL changes from elsewhere (clear, segment, back).
  useEffect(() => setLocal(value), [value]);

  function handle(next: string) {
    setLocal(next);
    clearTimeout(timer.current);
    // Debounced so typing does not fire a query per keystroke.
    timer.current = setTimeout(() => onChange(next), 250);
  }

  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <Input
        type="search"
        value={local}
        onChange={(event) => handle(event.target.value)}
        placeholder="Search name, email, company…"
        aria-label="Search contacts"
        className={cn('pl-8', pending && 'opacity-80')}
      />
    </div>
  );
}

function FilterMenu({
  icon: Icon,
  label,
  selected,
  options,
  onToggle,
  onClear,
  renderDot,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  selected: string[];
  options: Option[];
  onToggle: (id: string) => void;
  onClear: () => void;
  renderDot?: (option: Option) => React.ReactNode;
}) {
  if (options.length === 0) return null;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="md" className={cn(selected.length > 0 && 'border-brand text-brand')}>
          <Icon className="size-4" />
          {label}
          {selected.length > 0 && (
            <span className="tnum rounded bg-brand-subtle px-1 text-[11px] font-semibold">{selected.length}</span>
          )}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {options.map((option) => (
          <DropdownCheckItem
            key={option.id}
            checked={selected.includes(option.id)}
            onClick={() => onToggle(option.id)}
          >
            <span className="flex items-center gap-2">
              {renderDot?.(option)}
              <span className="truncate">{option.name}</span>
              {option.count != null && <span className="tnum ml-auto text-xs text-subtle">{option.count}</span>}
            </span>
          </DropdownCheckItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={onClear}>Clear {label.toLowerCase()}</DropdownItem>
          </>
        )}
      </DropdownContent>
    </Dropdown>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="-mr-0.5 rounded p-0.5 text-subtle transition-colors hover:text-default"
        aria-label="Remove filter"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
