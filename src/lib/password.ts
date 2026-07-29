import 'server-only';

import { hash, verify } from '@node-rs/argon2';

/**
 * Password checking for the single admin account.
 *
 * Only an argon2 hash in `ADMIN_PASSWORD_HASH` is ever verified in production.
 * Docker installs set a plaintext `ADMIN_PASSWORD` instead and the container
 * entrypoint hashes it at start-up, so the value reaching this module is still a
 * hash. Reading the plaintext directly stays a development-only path.
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
      throw new Error(
        'A production server will not compare a plaintext ADMIN_PASSWORD. Run in Docker, which hashes it at start-up, or set ADMIN_PASSWORD_HASH.',
      );
    }
    return timingSafeCompare(candidate, plain);
  }

  throw new Error('No admin password configured. Set ADMIN_PASSWORD (see README).');
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
