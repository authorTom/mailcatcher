'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { TimePoint } from '@/lib/queries/analytics';
import { formatNumber } from '@/lib/utils';

/**
 * Submissions and new contacts over time.
 *
 * Both series are counts of the same thing, so they share ONE y-axis — a second
 * scale would let the two lines cross wherever the scales happened to put them
 * and imply relationships that are not in the data.
 *
 * Colours come from the fixed categorical slots as CSS variables, so light and
 * dark each use their own validated step without any JS involvement.
 */
export function SubmissionsChart({ data, range }: { data: TimePoint[]; range: string }) {
  const compact = data.length > 45;

  return (
    <div className="w-full min-w-0">
      {/* Two series, so a legend is always present — identity is never colour alone. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendItem color="var(--viz-1)" label="Submissions" />
        <LegendItem color="var(--viz-3)" label="New contacts" />
      </div>

      {/* Recharts measures its parent asynchronously and can briefly overshoot it,
          which would scroll the whole page sideways on a narrow screen. */}
      <div className="h-[260px] w-full min-w-0 overflow-hidden sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="fillSubmissions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillContacts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-3)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--viz-3)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Recessive chrome: horizontal rules only, no vertical clutter. */}
            <CartesianGrid stroke="var(--viz-grid)" strokeDasharray="0" vertical={false} />

            <XAxis
              dataKey="day"
              tickFormatter={formatTick}
              tick={{ fill: 'var(--viz-label)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              minTickGap={compact ? 40 : 16}
              dy={6}
            />
            <YAxis
              tick={{ fill: 'var(--viz-label)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
            />

            <Tooltip
              cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
              content={<ChartTooltip />}
              // Keep the tooltip from covering the point it describes.
              offset={12}
            />

            <Area
              type="monotone"
              dataKey="submissions"
              name="Submissions"
              stroke="var(--viz-1)"
              strokeWidth={2}
              fill="url(#fillSubmissions)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="contacts"
              name="New contacts"
              stroke="var(--viz-3)"
              strokeWidth={2}
              fill="url(#fillContacts)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="sr-only">
        Chart of submissions and new contacts per day over the {range}. The underlying figures are
        available in the forms and contacts tables.
      </p>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-muted">
      <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

type TooltipPayload = { name: string; value: number; color: string; dataKey: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="card min-w-[160px] px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-muted">{label ? formatFull(label) : ''}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            {entry.name}
          </span>
          {/* Value wears the text token, not the series colour. */}
          <span className="tnum text-xs font-semibold text-default">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function formatTick(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function formatFull(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
