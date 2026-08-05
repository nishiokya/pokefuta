#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const analytics = read('src/lib/analytics/gtag.ts');
const provider = read('src/components/GoogleAnalytics.tsx');
const eventCallers = [
  read('src/app/my-trip/page.tsx'),
  read('src/app/manhole/[id]/ManholePage.tsx'),
].join('\n');

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(analytics.includes("new Set(['pokefuta.com', 'www.pokefuta.com'])"), 'production hostname allowlist is missing');
expect(provider.includes("window.gtag('event', 'page_view'"), 'standard page_view tracking is missing');
expect(analytics.includes("trackEvent('page_view'"), 'page-view helper must use the standard event name');
expect(provider.includes('page_location: `${window.location.origin}${pathname}`'), 'page_location must exclude query parameters');
expect(!analytics.includes("trackEvent('error_event'"), 'legacy key event error_event must not be emitted');
expect(!analytics.includes("trackEvent('auth_error'"), 'legacy key event auth_error must not be emitted');
expect(!eventCallers.match(/\bsource\s*:/), 'analytics callers must use surface instead of GA reserved source');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('GA4 contract check passed');
