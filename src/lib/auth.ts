import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'mc_session';
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.APP_SECRET ?? 'dev-only-insecure-secret-change-me';
  return new TextEncoder().encode(secret);
}

/** Issues the signed session cookie value. */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

/**
 * Verify a session token. Runs in middleware as well as server code, so it must
 * stay free of Node-only APIs — jose is WebCrypto-based, argon2 is not.
 */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
