#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const analytics = read('src/lib/analytics/gtag.ts');
const provider = read('src/components/GoogleAnalytics.tsx');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const analyticsCallers = sourceFiles(path.join(root, 'src'))
  .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }))
  .filter(({ text }) => /useAnalytics|analytics\/gtag/.test(text));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const hostAllowlist = analytics.match(/ANALYTICS_HOSTS\s*=\s*new Set\(\[([^\]]+)\]\)/)?.[1] || '';
expect(hostAllowlist.includes("'pokefuta.com'"), 'pokefuta.com is missing from the production hostname allowlist');
expect(hostAllowlist.includes("'www.pokefuta.com'"), 'www.pokefuta.com is missing from the production hostname allowlist');
expect(!/localhost|127\.0\.0\.1/.test(hostAllowlist), 'development hosts must not be in the production allowlist');
expect(/window\.gtag!?\('event', 'page_view'/.test(provider), 'standard page_view tracking is missing');
expect(analytics.includes("trackEvent('p_page_view'"), 'legacy helper must not emit another standard page_view');
expect(provider.includes("'code'") && provider.includes("'access_token'"), 'sensitive query filtering is missing');
expect(provider.includes("get('from') === 'data'"), 'data-site referral tracking is missing');
expect(provider.includes("'p_data_referral'"), 'data-site referral event is missing');
expect(provider.includes('page_location: analyticsPageLocation'), 'sanitized page_location must be configured globally');
expect(provider.includes('(function() {'), 'analytics bootstrap must not leak variables to window');
expect(
  provider.includes("document.visibilityState === 'hidden'") && provider.includes('window.setTimeout(send, 0)'),
  'hidden tabs must send page_view without waiting for requestAnimationFrame'
);
expect(!analytics.includes("trackEvent('error_event'"), 'legacy key event error_event must not be emitted');
expect(!analytics.includes("trackEvent('auth_error'"), 'legacy key event auth_error must not be emitted');
for (const { file, text } of analyticsCallers) {
  expect(!text.match(/\bsource\s*:/), `${path.relative(root, file)} must use surface instead of GA reserved source`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('GA4 contract check passed');
