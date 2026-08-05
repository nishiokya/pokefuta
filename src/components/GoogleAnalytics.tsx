'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isProductionAnalyticsHost } from '@/lib/analytics/gtag';

export default function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabled(isProductionAnalyticsHost(window.location.hostname));
  }, []);

  useEffect(() => {
    if (!enabled || !ready || typeof window.gtag !== 'function') return;

    // OAuth code やエラー詳細などのクエリ文字列を GA に送らない。
    window.gtag('event', 'page_view', {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_title: document.title,
      site_type: 'photo',
    });
  }, [enabled, pathname, ready]);

  if (!enabled) return null;

  return (
    <>
      <Script id="google-analytics-bootstrap" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
          window.gtag('js', new Date());
          window.gtag('set', 'linker', {
            domains: ['pokefuta.com', 'data.pokefuta.com'],
            accept_incoming: true
          });
          window.gtag('config', ${JSON.stringify(measurementId)}, {
            send_page_view: false,
            anonymize_ip: true
          });
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
