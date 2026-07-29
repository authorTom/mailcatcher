import { SignJWT } from 'jose';
const key = new TextEncoder().encode(process.env.APP_SECRET ?? 'dev-secret-for-testing');
console.log(await new SignJWT({ sub: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(key));
