'use client';

import { useSyncExternalStore } from 'react';
import { isInsecureBrowserContext } from '@/app/lib/password-prehash';

const noopSubscribe = () => () => {};

/**
 * True when the page runs over plain HTTP on a non-local host, where the
 * production session cookie (Secure) cannot be stored. False during SSR so
 * hydration always matches.
 */
export function useInsecureContext(): boolean {
  return useSyncExternalStore(noopSubscribe, isInsecureBrowserContext, () => false);
}
