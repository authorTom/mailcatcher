/**
 * Where visitors actually reach this install.
 *
 * `request.url` is built by the server from the address it listens on, so in
 * Docker behind a reverse proxy it comes out as `http://0.0.0.0:3000` — fine for
 * routing internally, useless the moment it is put in a `Location` header. Every
 * URL that leaves the server for a browser must come from here instead.
 *
 * Order of trust: the configured `APP_URL`, then the proxy's forwarded headers,
 * then the request itself. `APP_URL` comes first deliberately — `X-Forwarded-Host`
 * is attacker-controlled on an install with no proxy in front, and letting it
 * decide the redirect host would turn every form into an open redirect.
 */

/** Hosts that mean "this machine" and so can never be a public origin. */
const UNROUTABLE = new Set(['0.0.0.0', '[::]', '::']);

export function publicOrigin(headers: Headers, requestUrl?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    const url = parse(configured);
    if (url) return url.origin;
  }

  // A proxy chain appends to X-Forwarded-*, so the first entry is the client-facing hop.
  const host = first(headers.get('x-forwarded-host')) ?? headers.get('host');
  if (host && isRoutable(host)) {
    const protocol = first(headers.get('x-forwarded-proto')) ?? defaultProtocol(host);
    return `${protocol}://${host}`;
  }

  if (requestUrl) {
    const url = parse(requestUrl);
    if (url && isRoutable(url.host)) return url.origin;
  }

  return 'http://localhost:3000';
}

/** The public origin with `pathname` appended — the usual way to build a redirect. */
export function publicUrl(path: string, headers: Headers, requestUrl?: string): URL {
  return new URL(path, publicOrigin(headers, requestUrl));
}

function parse(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function first(value: string | null): string | null {
  const head = value?.split(',')[0]?.trim();
  return head ? head : null;
}

function isRoutable(host: string): boolean {
  return !UNROUTABLE.has(host.replace(/:\d+$/, ''));
}

/** Anything that is not plainly a local address is assumed to be served over TLS. */
function defaultProtocol(host: string): string {
  const name = host.replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' ? 'http' : 'https';
}
