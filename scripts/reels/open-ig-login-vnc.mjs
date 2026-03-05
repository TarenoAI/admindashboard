#!/usr/bin/env node
import { chromium } from 'playwright';

const PROFILE_DIR = process.env.IG_PROFILE_DIR || '/root/InstaFollow/data/browser-profiles/instagram_2';
const DISPLAY = process.env.DISPLAY || ':99';

async function main() {
  process.env.DISPLAY = DISPLAY;
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('🔓 Instagram Login im VNC-Fenster geöffnet.');
  console.log('Logge dich ein und lass das Fenster offen.');
  console.log('Zum Beenden: Strg+C');

  await new Promise(() => {});
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
