'use client';

import { Check, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Merge } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { TagBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input, Label } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { TAG_COLORS, tagColor } from '@/lib/constants';
import { cn, formatNumber } from '@/lib/utils';
import { createTag, deleteTag, mergeTags, renameTag } from '../contacts/actions';

type TagRow = { id: string; name: string; color: string; count: number };

export function TagsManager({ tags, createOnly = false }: { tags: TagRow[]; createOnly?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? 'Saved');
        setEditing(null);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong');
      }
    });
  }

  if (createOnly) return <CreateTagForm onCreate={(name, color) => run(() => createTag(name, color))} pending={pending} compact />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {tags.map((tag) => (
            <li key={tag.id} className="px-4 py-3">
              {editing === tag.id ? (
                <EditTagForm
                  tag={tag}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(name, color) => run(() => renameTag(tag.id, name, color))}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <TagBadge name={tag.name} color={tag.color} />

                  <Link
                    href={`/contacts?tag=${tag.id}`}
                    className="text-sm text-muted hover:text-brand hover:underline"
                  >
                    {formatNumber(tag.count)} contact{tag.count === 1 ? '' : 's'}
                  </Link>

                  <div className="ml-auto">
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${tag.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownTrigger>
                      <DropdownContent align="end">
                        <DropdownItem onSelect={() => setEditing(tag.id)}>
                          <Pencil className="size-3.5" />
                          Rename or recolour
                        </DropdownItem>

                        {tags.length > 1 && (
                          <>
                            <DropdownSeparator />
                            <DropdownLabel>Merge into…</DropdownLabel>
                            {tags
                              .filter((t) => t.id !== tag.id)
                              .map((target) => (
                                <DropdownItem
                                  key={target.id}
                                  onSelect={() => {
                                    if (!confirm(`Merge “${tag.name}” into “${target.name}”? Every contact keeps the ${target.name} tag and “${tag.name}” is deleted.`)) return;
                                    run(() => mergeTags(tag.id, target.id));
                                  }}
                                >
                                  <Merge className="size-3.5" />
                                  {target.name}
                                </DropdownItem>
                              ))}
                          </>
                        )}

                        <DropdownSeparator />
                        <DropdownItem
                          destructive
                          onSelect={() => {
                            if (!confirm(`Delete the tag “${tag.name}”? Contacts keep their data — they simply lose this tag.`)) return;
                            run(() => deleteTag(tag.id));
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete tag
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="h-fit p-4">
        <h2 className="mb-3 text-sm font-semibold">New tag</h2>
        <CreateTagForm onCreate={(name, color) => run(() => createTag(name, color))} pending={pending} />
      </Card>
    </div>
  );
}

function CreateTagForm({
  onCreate,
  pending,
  compact = false,
}: {
  onCreate: (name: string, color: string) => void;
  pending: boolean;
  compact?: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[4]!.name);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name, color);
    setName('');
  }

  return (
    <form onSubmit={submit} className={cn('space-y-3', compact && 'flex items-end gap-2 space-y-0')}>
      <div className={cn('space-y-1.5', compact && 'space-y-1.5')}>
        {!compact && <Label htmlFor="tag-name">Name</Label>}
        <Input
          id="tag-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Hot lead"
          maxLength={40}
          required
        />
      </div>

      {!compact && (
        <div className="space-y-1.5">
          <Label>Colour</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}

      <Button type="submit" variant="primary" disabled={pending || !name.trim()} className={cn(!compact && 'w-full')}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        Create tag
      </Button>
    </form>
  );
}

function EditTagForm({
  tag,
  pending,
  onSave,
  onCancel,
}: {
  tag: TagRow;
  pending: boolean;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, color);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <Input value={name} onChange={(event) => setName(event.target.value)} className="max-w-[14rem]" autoFocus required />
      <ColorPicker value={color} onChange={setColor} />
      <div className="ml-auto flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tag colour">
      {TAG_COLORS.map((option) => (
        <button
          key={option.name}
          type="button"
          role="radio"
          aria-checked={value === option.name}
          aria-label={option.name}
          onClick={() => onChange(option.name)}
          className={cn(
            'flex size-7 items-center justify-center rounded-lg border transition-all',
            value === option.name ? 'border-brand' : 'border-transparent hover:border-[var(--border-strong)]',
          )}
          style={{ backgroundColor: tagColor(option.name).bg }}
        >
          {value === option.name ? (
            <Check className="size-3.5" strokeWidth={3} style={{ color: option.dot }} />
          ) : (
            <span className="size-2.5 rounded-full" style={{ backgroundColor: option.dot }} />
          )}
        </button>
      ))}
    </div>
  );
}
