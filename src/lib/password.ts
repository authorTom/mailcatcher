import 'server-only';

import { hash, verify } from '@node-rs/argon2';

/**
 * Password checking for the single admin account.
 *
 * `ADMIN_PASSWORD_HASH` (argon2) is the supported production path — generate one
 * with `npm run hash-password`. `ADMIN_PASSWORD` is a plaintext escape hatch for
 * local development only, and refuses to work in production.
 */
export async function checkPassword(candidate: string): Promise<boolean> {
  const stored = process.env.ADMIN_PASSWORD_HASH;

  if (stored) {
    try {
      return await verify(stored, candidate);
    } catch {
      return false;
    }
  }

  const plain = process.env.ADMIN_PASSWORD;
  if (plain) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_PASSWORD is not permitted in production — set ADMIN_PASSWORD_HASH instead.');
    }
    return timingSafeCompare(candidate, plain);
  }

  throw new Error('No admin password configured. Set ADMIN_PASSWORD_HASH (see README).');
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export function isPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD);
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
