#!/usr/bin/env node

/**
 * Screen Capture Tool for Pokefuta App
 *
 * Reads target URLs from targeturl.md and captures screenshots
 * for both desktop and mobile viewports.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Configuration
const CONFIG = {
  targetUrlFile: path.join(__dirname, 'targeturl.md'),
  outputDir: path.join(__dirname, 'output'),
  viewports: {
    desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    mobile: { width: 375, height: 812, deviceScaleFactor: 2 }, // iPhone X
  },
  timeout: 30000, // 30 seconds
  waitForSelector: 'body', // Wait for body to ensure page is loaded
};

/**
 * Parse targeturl.md and extract URLs
 */
function parseTargetUrls(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const urls = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Extract URL from markdown list format (- or *)
      const match = trimmed.match(/^[-*]\s+(https?:\/\/[^\s]+)/);
      if (match) {
        urls.push(match[1]);
      }
    }

    return urls;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Generate filename from URL
 */
function generateFilename(url, viewport) {
  const urlObj = new URL(url);
  let pathname = urlObj.pathname;

  // Handle root path
  if (pathname === '/') {
    pathname = 'home';
  } else {
    // Remove leading/trailing slashes and replace remaining slashes with dashes
    pathname = pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
  }

  return `${pathname}-${viewport}.png`;
}

/**
 * Create timestamped output directory
 */
function createOutputDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');

  const dirPath = path.join(CONFIG.outputDir, timestamp);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
}

/**
 * Capture screenshot for a given URL and viewport
 */
async function captureScreenshot(page, url, viewport, outputDir) {
  const viewportName = viewport === CONFIG.viewports.desktop ? 'desktop' : 'mobile';
  const filename = generateFilename(url, viewportName);
  const outputPath = path.join(outputDir, filename);

  console.log(`  Capturing ${viewportName} view...`);

  try {
    // Set viewport
    await page.setViewport(viewport);

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout,
    });

    // Wait for body to ensure page is loaded
    await page.waitForSelector(CONFIG.waitForSelector, {
      timeout: CONFIG.timeout,
    });

    // Additional wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: true,
    });

    console.log(`  ✓ Saved: ${filename}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error capturing ${viewportName}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎯 Pokefuta Screen Capture Tool\n');

  // Parse target URLs
  console.log('📖 Reading target URLs...');
  const urls = parseTargetUrls(CONFIG.targetUrlFile);

  if (urls.length === 0) {
    console.error('❌ No URLs found in targeturl.md');
    process.exit(1);
  }

  console.log(`Found ${urls.length} URL(s):\n`);
  urls.forEach((url, index) => {
    console.log(`  ${index + 1}. ${url}`);
  });
  console.log();

  // Create output directory
  const outputDir = createOutputDirectory();
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Launch browser
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Process each URL
    let successCount = 0;
    let totalCaptures = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n📸 [${i + 1}/${urls.length}] ${url}`);

      // Capture desktop view
      totalCaptures++;
      const desktopSuccess = await captureScreenshot(
        page,
        url,
        CONFIG.viewports.desktop,
        outputDir
      );
      if (desktopSuccess) successCount++;

      // Capture mobile view
      totalCaptures++;
      const mobileSuccess = await captureScreenshot(
        page,
        url,
        CONFIG.viewports.mobile,
        outputDir
      );
      if (mobileSuccess) successCount++;
    }

    console.log(`\n\n✅ Complete!`);
    console.log(`   Success: ${successCount}/${totalCaptures}`);
    console.log(`   Output: ${outputDir}`);

    if (successCount < totalCaptures) {
      console.log(`\n⚠️  Some captures failed. Please check the errors above.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
