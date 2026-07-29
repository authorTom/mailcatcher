import { Inbox } from 'lucide-react';
import Link from 'next/link';

import { BarList } from '@/components/charts/bar-list';
import { SubmissionsChart } from '@/components/charts/submissions-chart';
import { Avatar } from '@/components/dashboard/avatar';
import { RangePicker } from '@/components/dashboard/range-picker';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from '@/components/ui/card';
import { parseRange, rangeLabel } from '@/lib/constants';
import {
  getFormBreakdown,
  getKpis,
  getRecentSubmissions,
  getTimeSeries,
  getTopCampaigns,
  getTopSources,
} from '@/lib/queries/analytics';
import { formatPercent, formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range = parseRange(rawRange);
  const label = rangeLabel(range).toLowerCase();

  const kpis = getKpis(range);
  const series = getTimeSeries(range);
  const formBreakdown = getFormBreakdown(range);
  const sources = getTopSources(range);
  const campaigns = getTopCampaigns(range);
  const recent = getRecentSubmissions();

  // A brand new install should explain itself rather than show five zeroes.
  if (kpis.totalContacts === 0 && formBreakdown.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <Card>
          <EmptyState
            icon={Inbox}
            title="No forms yet"
            description="Create your first form to get an endpoint you can point a landing page at. Submissions will appear here straight away."
            action={
              <Button asChild variant="primary">
                <Link href="/forms/new">Create a form</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description={`Performance across all your landing pages, ${label}.`}>
        <RangePicker value={range} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatTile label="Total contacts" value={kpis.totalContacts} hint="all time" />
        <StatTile label="Submissions" value={kpis.submissions} change={kpis.submissionsChange} />
        <StatTile label="New contacts" value={kpis.newContacts} change={kpis.contactsChange} />
        <StatTile
          label="Conversion rate"
          value={kpis.conversionRate == null ? '—' : formatPercent(kpis.conversionRate)}
          hint={kpis.conversionRate == null ? 'no views recorded' : 'of form views'}
        />
        <StatTile label="Spam blocked" value={kpis.spamBlocked} invertDelta hint="never reached your list" />
      </div>

      <Card className="mt-4 sm:mt-5">
        <CardHeader title="Submissions over time" description={`Daily totals, ${label}.`} />
        <CardBody>
          <SubmissionsChart data={series} range={label} />
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 sm:mt-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top forms" description="By submissions in this period." action={{ href: '/forms', label: 'All forms' }} />
          <CardBody className="pt-3">
            <BarList
              colorVar="--viz-1"
              emptyMessage="No submissions in this period"
              items={formBreakdown.slice(0, 6).map((f) => ({
                key: f.id,
                label: f.name,
                value: f.submissions,
                meta: f.conversionRate == null ? undefined : formatPercent(f.conversionRate, 0),
                href: `/forms/${f.id}`,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top sources" description="Where your submissions came from." />
          <CardBody className="pt-3">
            <BarList
              colorVar="--viz-3"
              emptyMessage="No submissions in this period"
              items={sources.map((s) => ({ key: s.source, label: s.source, value: s.submissions }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top campaigns" description="From the utm_campaign parameter." />
          <CardBody className="pt-3">
            <BarList
              colorVar="--viz-2"
              emptyMessage="No campaign data in this period"
              items={campaigns.map((c) => ({
                key: `${c.source}-${c.campaign}`,
                label: c.campaign,
                value: c.submissions,
                meta: c.source,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent submissions" description="The latest people to sign up." action={{ href: '/contacts', label: 'All contacts' }} />
          <CardBody className="pt-2">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-subtle">Nothing yet</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/contacts?contact=${s.contactId}`}
                      className="flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={s.name} email={s.email} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name ?? s.email}</p>
                        <p className="truncate text-xs text-muted">
                          {s.name ? `${s.email} · ` : ''}
                          {s.formName}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-subtle">{formatRelative(s.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
