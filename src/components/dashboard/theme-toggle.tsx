'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  // Read the class the inline head script already applied, so the button state
  // matches what is on screen without causing a hydration mismatch.
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('mc-theme', next ? 'dark' : 'light');
    } catch {
      /* private browsing — the toggle still works for this session */
    }
    setDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark === null ? <Sun className="opacity-0" /> : dark ? <Sun /> : <Moon />}
    </Button>
  );
}
