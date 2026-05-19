'use client';

import { useEffect } from 'react';
import { errorEvents } from '@/lib/analytics/gtag';

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

export default function ApiErrorAnalytics() {
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
          errorEvents.api(apiPath, response.status, method, response.statusText);
        }

        return response;
      } catch (error) {
        if (apiPath) {
          errorEvents.api(
            apiPath,
            0,
            method,
            error instanceof Error ? error.message : 'Network request failed'
          );
        }

        throw error;
      }
    };
  }, []);

  return null;
}
