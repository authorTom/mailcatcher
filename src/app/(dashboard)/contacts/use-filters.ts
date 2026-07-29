'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * Filters live in the URL, not component state.
 *
 * That makes any view shareable, lets the back button undo a filter, and means
 * the server component re-queries without us duplicating the filter state.
 */
export function useFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (mutate: (query: URLSearchParams) => void) => {
      const query = new URLSearchParams(params.toString());
      mutate(query);
      // Any filter change invalidates the current page number.
      query.delete('page');
      startTransition(() => {
        router.push(query.size ? `?${query}` : '?', { scroll: false });
      });
    },
    [params, router],
  );

  const setValue = useCallback(
    (key: string, value: string | null) => {
      apply((query) => {
        if (value) query.set(key, value);
        else query.delete(key);
      });
    },
    [apply],
  );

  const toggleValue = useCallback(
    (key: string, value: string) => {
      apply((query) => {
        const current = query.getAll(key);
        query.delete(key);
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
        for (const v of next) query.append(key, v);
      });
    },
    [apply],
  );

  const clearAll = useCallback(() => {
    startTransition(() => router.push('?', { scroll: false }));
  }, [router]);

  return {
    params,
    pending,
    apply,
    setValue,
    toggleValue,
    clearAll,
    get: (key: string) => params.get(key),
    getAll: (key: string) => params.getAll(key),
  };
}
