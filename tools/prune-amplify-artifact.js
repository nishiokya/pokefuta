const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const nextCachePath = path.join(root, '.next', 'cache');

if (fs.existsSync(nextCachePath)) {
  fs.rmSync(nextCachePath, { recursive: true, force: true });
  console.log('[amplify-artifact] Removed .next/cache from build artifact');
} else {
  console.log('[amplify-artifact] .next/cache was not present');
}
