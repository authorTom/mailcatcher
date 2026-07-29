import crypto from 'node:crypto';

const secret = process.env.APP_SECRET;

if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('APP_SECRET must be set in production. Generate one with: openssl rand -hex 32');
}

export const APP_SECRET = secret ?? 'dev-only-insecure-secret-change-me';

/**
 * Salted hash of a client IP. We keep this only for rate limiting and coarse
 * de-duplication — the raw address is never written to disk.
 */
export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(`ip:${ip}`).digest('base64url').slice(0, 22);
}

export function sign(value: string): string {
  return crypto.createHmac('sha256', APP_SECRET).update(value).digest('base64url');
}

/** Constant-time compare, safe against differing lengths. */
export function verify(value: string, signature: string): boolean {
  const expected = sign(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Issues the `_ts` token embedded in every form, used by the time trap. */
export function issueFormToken(now = Date.now()): string {
  return `${now}.${sign(String(now))}`;
}

export type TokenCheck = 'ok' | 'missing' | 'invalid' | 'too-fast' | 'expired';

export function checkFormToken(token: string | undefined, now = Date.now()): TokenCheck {
  if (!token) return 'missing';

  const [issuedRaw, signature] = token.split('.');
  if (!issuedRaw || !signature) return 'invalid';
  if (!verify(issuedRaw, signature)) return 'invalid';

  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued)) return 'invalid';

  const age = now - issued;
  // A human cannot read a form, type an email and submit inside two seconds.
  if (age < 2_000) return 'too-fast';
  if (age > 24 * 60 * 60 * 1000) return 'expired';

  return 'ok';
}
