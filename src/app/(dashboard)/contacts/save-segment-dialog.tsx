'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import type { SegmentFilter } from '@/db/schema';
import { saveSegment } from './actions';

/** Saves the currently applied filters under a name for one-click recall. */
export function SaveSegmentDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: SegmentFilter;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveSegment(name, filters);
      if (result.ok) {
        toast.success(result.message ?? 'Segment saved.');
        setName('');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-surface p-5 shadow-2xl focus:outline-none">
          <Dialog.Title className="text-base font-semibold tracking-tight">Save this view</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            The current filters are stored under a name so you can return to them in one click.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="segment-name">Name</Label>
              <Input
                id="segment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Enterprise demo requests"
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
                {pending && <Loader2 className="animate-spin" />}
                Save segment
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
