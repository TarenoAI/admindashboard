#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const reelUrl = process.argv[2];
if (!reelUrl) {
  console.error('Usage: node scripts/reels/download-reel.mjs <instagram-reel-url>');
  process.exit(1);
}

const OUT_DIR = process.env.REELS_OUT_DIR || '/root/.openclaw/workspace-tareno/downloads/reels';
const PROFILE_DIR = process.env.IG_PROFILE_DIR || '/root/InstaFollow/data/browser-profiles/instagram_2';
const DISPLAY = process.env.DISPLAY || ':99';

fs.mkdirSync(OUT_DIR, { recursive: true });

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

async function waitForVideoSrc(page, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const src = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v?.src || null;
    });
    if (src && src.startsWith('http')) return src;
    await page.waitForTimeout(1000);
  }
  return null;
}

async function main() {
  process.env.DISPLAY = DISPLAY;

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('/accounts/login')) {
      throw new Error('Nicht eingeloggt. Bitte zuerst via VNC bei Instagram einloggen.');
    }

    const videoUrl = await waitForVideoSrc(page);
    if (!videoUrl) {
      throw new Error('Kein Reel-Video gefunden (evtl. privat/geo-blocked/gelöscht).');
    }

    const cookies = await context.cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    const res = await fetch(videoUrl, {
      headers: {
        'user-agent': await page.evaluate(() => navigator.userAgent),
        'referer': reelUrl,
        'cookie': cookieHeader
      }
    });

    if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);

    const urlObj = new URL(reelUrl);
    const slug = sanitize(urlObj.pathname.split('/').filter(Boolean).pop() || `reel_${Date.now()}`);
    const outFile = path.join(OUT_DIR, `${slug}.mp4`);

    const fileStream = fs.createWriteStream(outFile);
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
    }
    fileStream.end();

    console.log(`✅ Download fertig: ${outFile}`);
  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
