'use client';

import { AlertTriangle, Database, Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { Input, Label, Select } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { formatDate, formatNumber } from '@/lib/utils';
import {
  applyRetention,
  deleteAllContacts,
  generatePasswordHash,
  purgeSpam,
  vacuumDatabase,
  type DatabaseStats,
} from './actions';

export function SettingsView({
  stats,
  usingPlaintextPassword,
}: {
  stats: DatabaseStats;
  usingPlaintextPassword: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? 'Done');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong');
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Export */}
      <Card>
        <CardHeader title="Export" description="Everything, as CSV. Filtered exports live on the contacts page." />
        <CardBody className="space-y-3">
          <Button asChild variant="secondary" className="w-full justify-start">
            <a href="/api/export/contacts">
              <Download />
              Export all contacts ({formatNumber(stats.contacts)})
            </a>
          </Button>
          <Button asChild variant="secondary" className="w-full justify-start">
            <a href="/api/export/submissions">
              <Download />
              Export all submissions ({formatNumber(stats.submissions)})
            </a>
          </Button>
          <p className="text-xs text-muted">
            Exports stream, so a large list will not time out. Spreadsheet formulas in submitted
            values are neutralised on the way out.
          </p>
        </CardBody>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader title="Storage" description="One SQLite file — back it up by copying it." />
        <CardBody className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Contacts" value={formatNumber(stats.contacts)} />
            <Stat label="Submissions" value={formatNumber(stats.submissions)} />
            <Stat label="Spam blocked" value={formatNumber(stats.spam)} />
            <Stat label="Database size" value={formatBytes(stats.sizeBytes)} />
            <Stat label="Forms" value={formatNumber(stats.forms)} />
            <Stat
              label="Oldest record"
              value={stats.oldestSubmission ? formatDate(stats.oldestSubmission) : '—'}
            />
          </dl>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" disabled={pending || stats.spam === 0} onClick={() => run(purgeSpam)}>
              <Trash2 />
              Purge spam records
            </Button>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(vacuumDatabase)}>
              <Database />
              Compact database
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Retention */}
      <RetentionCard pending={pending} onApply={(days) => run(() => applyRetention(days))} />

      {/* Password */}
      <PasswordCard usingPlaintextPassword={usingPlaintextPassword} />

      {/* Danger zone */}
      <Card className="lg:col-span-2" style={{ borderColor: 'color-mix(in oklab, var(--danger) 35%, transparent)' }}>
        <CardHeader title="Danger zone" description="These cannot be undone. Take a copy of the database first." />
        <CardBody>
          <DeleteAllForm pending={pending} onDelete={(confirmation) => run(() => deleteAllContacts(confirmation))} />
        </CardBody>
      </Card>
    </div>
  );
}

function RetentionCard({ pending, onApply }: { pending: boolean; onApply: (days: number) => void }) {
  const [days, setDays] = useState('365');

  return (
    <Card>
      <CardHeader
        title="Data retention"
        description="Trim old submission history. Contacts themselves are always kept."
      />
      <CardBody className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="retention">Delete submissions older than</Label>
          <Select id="retention" value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="90">90 days</option>
            <option value="180">6 months</option>
            <option value="365">1 year</option>
            <option value="730">2 years</option>
          </Select>
        </div>

        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete every submission older than ${days} days? Contacts are kept, but their history before that date is lost.`)) return;
            onApply(Number(days));
          }}
        >
          {pending && <Loader2 className="animate-spin" />}
          Apply now
        </Button>

        <p className="text-xs text-muted">
          This runs once when you click — there is no scheduler. Run it whenever you need to, or call
          it from cron against the container.
        </p>
      </CardBody>
    </Card>
  );
}

function PasswordCard({ usingPlaintextPassword }: { usingPlaintextPassword: boolean }) {
  const [password, setPassword] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await generatePasswordHash(password);
      if (result.ok) {
        setHash(result.hash);
        setPassword('');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Password"
        description="Your password is an environment variable, not a database row — so changing it means updating the environment and restarting."
      />
      <CardBody className="space-y-4">
        {usingPlaintextPassword && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              You are using <code className="font-mono">ADMIN_PASSWORD</code> in plaintext. Generate a
              hash below and switch to <code className="font-mono">ADMIN_PASSWORD_HASH</code> — the
              app refuses to start with a plaintext password in production.
            </span>
          </p>
        )}

        <form onSubmit={generate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending || password.length < 10}>
            {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Generate hash
          </Button>
        </form>

        {hash && (
          <CodeBlock
            code={`ADMIN_PASSWORD_HASH='${hash}'`}
            label="Add this to your environment"
            description="Put it in your .env or compose file, remove ADMIN_PASSWORD, then restart."
          />
        )}
      </CardBody>
    </Card>
  );
}

function DeleteAllForm({ pending, onDelete }: { pending: boolean; onDelete: (confirmation: string) => void }) {
  const [confirmation, setConfirmation] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="confirm-delete">
          Type <span className="font-mono font-semibold">DELETE</span> to erase every contact
        </Label>
        <Input
          id="confirm-delete"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="DELETE"
          className="max-w-[12rem]"
        />
      </div>
      <Button
        variant="danger"
        disabled={pending || confirmation !== 'DELETE'}
        onClick={() => {
          onDelete(confirmation);
          setConfirmation('');
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete all contacts
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tnum mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
