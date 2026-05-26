#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = Number(process.env.PORT || 3100);
const BASE_URL = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${PORT}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'test-results', 'ui-smoke');

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

const manholes = [
  {
    id: 1,
    title: 'ピカチュウのポケふた',
    name: 'ピカチュウのポケふた',
    prefecture: '東京都',
    municipality: '町田市',
    city: '町田市',
    latitude: 35.5467,
    longitude: 139.4386,
    pokemons: ['ピカチュウ'],
    is_visited: false,
    photo_count: 0,
  },
  {
    id: 2,
    title: 'イーブイのポケふた',
    name: 'イーブイのポケふた',
    prefecture: '北海道',
    municipality: '斜里町',
    city: '斜里町',
    latitude: 44.0219,
    longitude: 144.2697,
    pokemons: ['イーブイ'],
    is_visited: false,
    photo_count: 0,
  },
];

const mockResponses = {
  '/api/site-stats': {
    success: true,
    users: 0,
    posts: 0,
    manholes: manholes.length,
    manholes_with_photos: 0,
    source: 'ui-smoke',
  },
  '/api/visits': {
    success: true,
    authenticated: false,
    visits: [],
    total: 0,
  },
  '/api/manholes': {
    success: true,
    manholes,
    total: manholes.length,
    with_photos: 0,
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { redirect: 'manual' });
      if (response.status < 500) return;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${BASE_URL}: ${lastError?.message || 'no response'}`);
}

async function withServer(callback) {
  let exitCode = null;
  let exitSignal = null;
  const server = spawn('npm', ['run', 'start'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ci-anon-key',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || BASE_URL,
      NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT: process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LAT || '36.0',
      NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG: process.env.NEXT_PUBLIC_MAP_DEFAULT_CENTER_LNG || '138.0',
      NEXT_PUBLIC_MAP_DEFAULT_ZOOM: process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM || '10',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'ci-service-role-key',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || 'ci-placeholder',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || 'ci-placeholder',
      R2_ENDPOINT: process.env.R2_ENDPOINT || 'https://example.com',
      R2_BUCKET: process.env.R2_BUCKET || 'image',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));
  server.on('exit', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
  });

  try {
    await Promise.race([
      waitForServer(),
      new Promise((_, reject) => {
        server.once('exit', (code, signal) => {
          reject(new Error(`Next server exited before smoke tests started (code ${code}, signal ${signal})`));
        });
      }),
    ]);
    await callback();
  } finally {
    if (exitCode === null && exitSignal === null) {
      server.kill('SIGTERM');
      await sleep(500);
      if (exitCode === null && exitSignal === null) server.kill('SIGKILL');
    }
  }
}

async function installMocks(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (mockResponses[pathname]) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponses[pathname]),
      });
      return;
    }

    if (url.hostname.includes('supabase.co')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: null, user: null, session: null }),
      });
      return;
    }

    if (url.hostname.includes('tile.openstreetmap.org')) {
      request.respond({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          'base64'
        ),
      });
      return;
    }

    request.continue();
  });
}

async function textIncludes(page, text) {
  return page.evaluate((expected) => document.body.innerText.includes(expected), text);
}

async function assertText(page, text, context) {
  if (!(await textIncludes(page, text))) {
    throw new Error(`${context}: missing text "${text}"`);
  }
}

async function assertAnyText(page, texts, context) {
  const found = await page.evaluate(
    (expectedTexts) => expectedTexts.some((text) => document.body.innerText.includes(text)),
    texts
  );

  if (!found) {
    throw new Error(`${context}: missing one of ${texts.map((text) => `"${text}"`).join(', ')}`);
  }
}

async function assertNoRuntimeError(page, context) {
  const hasNextError = await page.evaluate(() => {
    const text = document.body.innerText;
    return (
      text.includes('Unhandled Runtime Error') ||
      text.includes('Application error: a client-side exception') ||
      text.includes('Hydration failed')
    );
  });

  if (hasNextError) {
    throw new Error(`${context}: runtime error overlay detected`);
  }
}

async function assertNoHorizontalOverflow(page, context) {
  const dimensions = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));

  if (dimensions.bodyWidth > dimensions.viewportWidth + 1) {
    throw new Error(
      `${context}: horizontal overflow (${dimensions.bodyWidth}px body > ${dimensions.viewportWidth}px viewport)`
    );
  }
}

async function assertMapVisible(page, context) {
  const mapBox = await page.evaluate(() => {
    const map = document.querySelector('.leaflet-container');
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  if (!mapBox || mapBox.width < 200 || mapBox.height < 200) {
    throw new Error(`${context}: map container was not visible`);
  }
}

async function capture(page, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  try {
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${name}.png`),
      fullPage: false,
    });
  } catch (error) {
    console.warn(`ui-smoke screenshot skipped (${name}): ${error.message}`);
  }
}

async function verifyHome(page, viewport) {
  const context = `/${viewport.name}`;
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await assertNoRuntimeError(page, context);
  await assertText(page, 'ポケふた写真館', context);
  await assertText(page, 'まだ投稿がありません', context);
  for (const label of ['探す', '投稿', 'スタンプ帳']) {
    await assertText(page, label, context);
  }
  await assertAnyText(page, ['アカウント作成', 'ログイン'], context);
  await assertNoHorizontalOverflow(page, context);
}

async function verifyPopular(page, viewport) {
  const context = `/popular ${viewport.name}`;
  await page.goto(`${BASE_URL}/popular`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await assertNoRuntimeError(page, context);
  await assertText(page, 'みんなのポケふた投稿', context);
  await assertText(page, 'まだ投稿がありません', context);
  await assertNoHorizontalOverflow(page, context);
}

async function verifyMap(page, viewport) {
  const context = `/map ${viewport.name}`;
  await page.goto(`${BASE_URL}/map`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await assertNoRuntimeError(page, context);
  await assertText(page, 'ポケふたマップ', context);
  await assertText(page, '全国のポケふたを表示します', context);
  await assertText(page, '都道府県', context);
  await assertText(page, 'コード順', context);
  await assertText(page, '数順', context);
  await assertText(page, `全${manholes.length}件のポケふたを表示中`, context);
  await assertMapVisible(page, context);
  await assertNoHorizontalOverflow(page, context);
}

async function run() {
  await withServer(async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      for (const viewport of viewports) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });

        try {
          await page.setViewport({ width: viewport.width, height: viewport.height });
          await installMocks(page);
          await verifyHome(page, viewport);
          await capture(page, `home-${viewport.name}`);
          await verifyPopular(page, viewport);
          await capture(page, `popular-${viewport.name}`);
          await verifyMap(page, viewport);
          await capture(page, `map-${viewport.name}`);

          const actionableErrors = errors.filter(
            (message) =>
              !message.includes('Supabase Admin設定エラー') &&
              !message.includes('Failed to load resource')
          );

          if (actionableErrors.length > 0) {
            throw new Error(`${viewport.name}: browser errors:\n${actionableErrors.join('\n')}`);
          }

          console.log(`ui-smoke passed: ${viewport.name} ${viewport.width}x${viewport.height}`);
        } catch (error) {
          await capture(page, `failure-${viewport.name}`).catch(() => {});
          throw error;
        } finally {
          await page.close().catch(() => {});
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

run().catch((error) => {
  console.error(`ui-smoke failed: ${error.stack || error.message}`);
  process.exit(1);
});
