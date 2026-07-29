/** Deliberately permissive — real-world addresses are stranger than the RFC-lite regexes allow. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(?:\.[^\s@,;.]+)+$/;

/** Free/disposable inbox providers used to fake signups. Extend as you see fit. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mailnesia.com',
  'spamgourmet.com',
  'mintemail.com',
  'moakt.com',
  'emailondeck.com',
  'tempr.email',
]);

/**
 * Lowercase and trim. Deliberately does NOT strip Gmail dots or `+tags`:
 * those are legitimately different addresses to many people, and silently
 * merging them would lose contacts.
 */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(email));
}
