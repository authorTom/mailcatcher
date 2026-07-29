import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { hash } from '@node-rs/argon2';

/**
 * Generates the ADMIN_PASSWORD_HASH value.
 * Usage: npm run hash-password
 */
const rl = createInterface({ input: stdin, output: stdout });

const password = await rl.question('New admin password (min 10 characters): ');
rl.close();

if (password.length < 10) {
  console.error('\n✗ Too short — use at least 10 characters.');
  process.exit(1);
}

const digest = await hash(password);

console.log('\nAdd this to your .env or compose file:\n');
console.log(`ADMIN_PASSWORD_HASH='${digest}'\n`);
