export type UtmValues = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

const KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

const empty: UtmValues = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
};

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || null;
}

/**
 * Resolve campaign attribution from, in order of trust:
 *   1. explicit `_utm_*` fields injected by the embed snippet
 *   2. `utm_*` fields someone wired up by hand
 *   3. the query string of the landing page URL
 *   4. the query string of the Referer header
 */
export function resolveUtm(
  payload: Record<string, string>,
  landingPageUrl: string | null,
  referrer: string | null,
): UtmValues {
  const result = { ...empty };

  for (const key of KEYS) {
    const field = `utm${key[0]!.toUpperCase()}${key.slice(1)}` as keyof UtmValues;
    result[field] = clean(payload[`_utm_${key}`] ?? payload[`utm_${key}`]);
  }

  for (const url of [landingPageUrl, referrer]) {
    if (!url) continue;
    if (KEYS.every((k) => result[`utm${k[0]!.toUpperCase()}${k.slice(1)}` as keyof UtmValues])) break;

    let params: URLSearchParams;
    try {
      params = new URL(url).searchParams;
    } catch {
      continue;
    }

    for (const key of KEYS) {
      const field = `utm${key[0]!.toUpperCase()}${key.slice(1)}` as keyof UtmValues;
      result[field] ??= clean(params.get(`utm_${key}`));
    }
  }

  return result;
}

/** Human label for a submission's origin, used across the dashboard. */
export function sourceLabel(utm: Pick<UtmValues, 'utmSource'>, referrer: string | null): string {
  if (utm.utmSource) return utm.utmSource;
  if (!referrer) return 'Direct';
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return 'Direct';
  }
}
