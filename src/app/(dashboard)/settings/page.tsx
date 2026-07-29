import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/card';
import { getDatabaseStats } from './actions';
import { SettingsView } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const stats = await getDatabaseStats();

  return (
    <>
      <PageHeader title="Settings" description="Exports, data retention and account security." />
      <SettingsView stats={stats} usingPlaintextPassword={!process.env.ADMIN_PASSWORD_HASH} />
    </>
  );
}
