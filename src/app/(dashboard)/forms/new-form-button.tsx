'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { createForm } from './actions';

export function NewFormButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      // On success the action redirects to the new form's setup page, so only
      // a failure returns here.
      const result = await createForm(name);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="primary">
          <Plus />
          New form
        </Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-surface p-5 shadow-2xl focus:outline-none">
          <Dialog.Title className="text-base font-semibold tracking-tight">New form</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Name it after the landing page it will sit on. You will get an endpoint URL straight away.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="form-name">Form name</Label>
              <Input
                id="form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Pricing page — request a demo"
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
                Create form
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
