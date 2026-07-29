import { LogOut } from 'lucide-react';

import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Logo, NavLinks } from '@/components/dashboard/nav';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { Button } from '@/components/ui/button';
import { logout } from '@/app/login/actions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      {/* Persistent sidebar on large screens; a sheet below that. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[var(--border)] bg-surface px-4 py-5 lg:flex">
        <div className="mb-7 px-1">
          <Logo />
        </div>

        <NavLinks />

        <form action={logout} className="mt-auto">
          <Button type="submit" variant="ghost" className="w-full justify-start">
            <LogOut />
            Sign out
          </Button>
        </form>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 backdrop-blur-md sm:px-6">
          <MobileNav />
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
