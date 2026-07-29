import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness probe — checks the process is up AND the database answers. */
export async function GET() {
  try {
    db.get(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
