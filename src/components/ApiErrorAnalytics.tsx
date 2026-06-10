'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { errorEvents, setAnalyticsAuthState } from '@/lib/analytics/gtag';

const API_ERROR_ANALYTICS_PATCHED = Symbol.for('pokefuta.apiErrorAnalyticsPatched');

type PatchedWindow = Window & {
  [API_ERROR_ANALYTICS_PATCHED]?: boolean;
};

function getApiPath(input: RequestInfo | URL): string | null {
  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(rawUrl, window.location.origin);

    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return null;
    }

    return url.pathname;
  } catch {
    return null;
  }
}

function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && 'method' in input && input.method) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function derivePageType(pathname: string): string {
  if (/^\/manhole\//.test(pathname)) return 'manhole_detail';
  if (pathname === '/') return 'gallery_index';
  if (pathname === '/visits') return 'visits';
  if (pathname === '/popular') return 'popular';
  if (pathname === '/upload') return 'upload';
  if (pathname === '/login') return 'login';
  if (pathname === '/signup') return 'signup';
  if (/^\/prefecture\//.test(pathname)) return 'prefecture';
  if (/^\/users\//.test(pathname)) return 'user_profile';
  if (pathname === '/nearby') return 'nearby';
  return 'other';
}

export default function ApiErrorAnalytics() {
  const isLoggedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    try {
      const supabase = createBrowserClient();

      supabase.auth.getSession()
        .then(({ data: { session } }) => {
          const v = Boolean(session?.user);
          isLoggedInRef.current = v;
          setAnalyticsAuthState(v);
        })
        .catch(() => {});

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const v = Boolean(session?.user);
        isLoggedInRef.current = v;
        setAnalyticsAuthState(v);
      });

      return () => subscription.unsubscribe();
    } catch {
      // analytics auth tracking is non-fatal
    }
  }, []);

  useEffect(() => {
    const patchedWindow = window as PatchedWindow;

    if (patchedWindow[API_ERROR_ANALYTICS_PATCHED]) return;
    patchedWindow[API_ERROR_ANALYTICS_PATCHED] = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const apiPath = getApiPath(input);
      const method = getMethod(input, init);

      try {
        const response = await originalFetch(input, init);

        if (apiPath && !response.ok) {
          errorEvents.api(apiPath, response.status, method, response.statusText, {
            is_logged_in: isLoggedInRef.current === null ? 'unknown' : isLoggedInRef.current,
            page_type: derivePageType(window.location.pathname),
            component: 'ApiErrorAnalytics',
          });
        }

        return response;
      } catch (error) {
        if (apiPath) {
          errorEvents.api(
            apiPath,
            0,
            method,
            error instanceof Error ? error.message : 'Network request failed',
            {
              is_logged_in: isLoggedInRef.current === null ? 'unknown' : isLoggedInRef.current,
              page_type: derivePageType(window.location.pathname),
              component: 'ApiErrorAnalytics',
            }
          );
        }

        throw error;
      }
    };
  }, []);

  return null;
}
