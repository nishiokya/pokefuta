'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { isProductionAnalyticsHost } from '@/lib/analytics/gtag';

const SENSITIVE_QUERY_KEYS = [
  'code',
  'token',
  'access_token',
  'refresh_token',
  'error',
  'error_description',
];

export function buildAnalyticsPageLocation(
  origin: string,
  pathname: string,
  search: string
): string {
  const params = new URLSearchParams(search);
  SENSITIVE_QUERY_KEYS.forEach((key) => params.delete(key));
  const query = params.toString();
  return `${origin}${pathname}${query ? `?${query}` : ''}`;
}

export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const dataReferralTracked = useRef(false);

  useEffect(() => {
    setEnabled(isProductionAnalyticsHost(window.location.hostname));
  }, []);

  useEffect(() => {
    if (!enabled || !ready || typeof window.gtag !== 'function') return;

    const pageLocation = buildAnalyticsPageLocation(
      window.location.origin,
      pathname,
      window.location.search
    );
    const fromData = new URLSearchParams(window.location.search).get('from') === 'data';
    let titleFrame = 0;
    let sendFrame = 0;
    let timer = 0;

    const send = () => {
      window.gtag!('set', { page_location: pageLocation });
      window.gtag!('event', 'page_view', {
        page_path: pathname,
        page_location: pageLocation,
        page_title: document.title,
        site_type: 'photo',
        source_app: fromData ? 'tracker' : undefined,
      });

      if (fromData && !dataReferralTracked.current) {
        dataReferralTracked.current = true;
        window.gtag!('event', 'p_data_referral', {
          source_app: 'tracker',
          destination_path: pathname,
        });
      }
    };

    if (document.visibilityState === 'hidden') {
      timer = window.setTimeout(send, 0);
    } else {
      // App Router の metadata 更新後に title を取得する。
      titleFrame = window.requestAnimationFrame(() => {
        sendFrame = window.requestAnimationFrame(send);
      });
    }

    return () => {
      window.cancelAnimationFrame(titleFrame);
      window.cancelAnimationFrame(sendFrame);
      window.clearTimeout(timer);
    };
  }, [enabled, pathname, ready]);

  if (!enabled) return null;

  return (
    <>
      <Script id="google-analytics-bootstrap" strategy="afterInteractive">
        {`
          (function() {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
            window.gtag('js', new Date());
            var analyticsUrl = new URL(window.location.href);
            ${JSON.stringify(SENSITIVE_QUERY_KEYS)}.forEach(function(key) {
              analyticsUrl.searchParams.delete(key);
            });
            var analyticsQuery = analyticsUrl.searchParams.toString();
            var analyticsPageLocation = analyticsUrl.origin + analyticsUrl.pathname +
              (analyticsQuery ? '?' + analyticsQuery : '');
            window.gtag('set', 'linker', {
              domains: ['pokefuta.com', 'data.pokefuta.com'],
              accept_incoming: true
            });
            var analyticsGlobalParams = { page_location: analyticsPageLocation };
            if (analyticsUrl.searchParams.get('from') === 'data') {
              analyticsGlobalParams.source_app = 'tracker';
            }
            window.gtag('set', analyticsGlobalParams);
            window.gtag('config', ${JSON.stringify(measurementId)}, {
              send_page_view: false,
              page_location: analyticsPageLocation
            });
          })();
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
    </>
  );
}
