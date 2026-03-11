#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let chromium, devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch (_) {
  ({ chromium, devices } = require('/root/InstaFollow/node_modules/playwright'));
}

const DEFAULT_OUTPUT_DIR = '/root/.openclaw/workspace-tareno/media/instagram-status';
const LATEST_DIR = '/root/.openclaw/workspace-tareno/media/instagram-status/latest';
const DASHBOARD_PUBLIC_DIR = '/root/.openclaw/workspace-tareno/tools/admin-dashboard/public';
const PUBLIC_BASE_URL = 'http://31.97.32.40:3477';
const DEVICE = devices['iPhone 13 Pro'];

const TARGETS = [
  {
    key: 'bulifollows',
    url: 'https://www.instagram.com/bulifollows/',
    sessionFile: '/root/InstaFollow/data/sessions/instagram-session.json',
    envUserKey: 'INSTAGRAM_USERNAME',
    envPassKey: 'INSTAGRAM_PASSWORD',
  },
  {
    key: 'bulifollows_update',
    url: 'https://www.instagram.com/bulifollows_update/',
    sessionFile: '/root/InstaFollow/data/sessions/instagram_2.json',
    envUserKey: 'INSTAGRAM_USERNAME_2',
    envPassKey: 'INSTAGRAM_PASSWORD_2',
  },
];

function timestampUtc() {
  const d = new Date();
  return d.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
}

function loadEnvFromFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function summarizePage(url, text) {
  const t = (text || '').toLowerCase();
  if (t.includes('weiter') && t.includes('anderes profil verwenden')) {
    return 'kontoauswahl';
  }
  if (t.includes('anmelden') || t.includes('passwort') || t.includes('log in')) {
    return 'login_erforderlich';
  }
  if (url.includes('/accounts/login')) {
    return 'login_redirect';
  }
  if (t.includes('challenge') || t.includes('sicherheitscode') || t.includes('bestätige')) {
    return 'challenge';
  }
  return 'unbekannt_oder_eingeloggt';
}

async function clickWeiterIfVisible(page) {
  const selectors = [
    'button:has-text("Weiter")',
    'div[role="button"]:has-text("Weiter")',
    'button:has-text("Continue")',
    'div[role="button"]:has-text("Continue")',
  ];

  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(2000);
        return true;
      } catch (_) {
        // try next selector
      }
    }
  }
  return false;
}

async function clickCloseIfVisible(page) {
  const selectors = [
    'button:has-text("Schließen")',
    'div[role="button"]:has-text("Schließen")',
    'button[aria-label="Schließen"]',
    'button:has-text("Close")',
    'div[role="button"]:has-text("Close")',
    'button[aria-label="Close"]',
  ];
  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 3000 });
        await page.waitForTimeout(1200);
        return true;
      } catch (_) {
        // ignore
      }
    }
  }
  return false;
}

async function typeInto(locator, value) {
  await locator.click({ timeout: 3000 });
  await locator.fill('');
  for (const ch of String(value || '')) {
    await locator.type(ch, { delay: 80 });
  }
}

async function tryLoginIfNeeded(page, username, password) {
  const currentUrl = page.url();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lower = String(bodyText || '').toLowerCase();
  const needsLogin = currentUrl.includes('/accounts/login') || lower.includes('anmelden') || lower.includes('passwort') || lower.includes('log in');
  if (!needsLogin || !username || !password) return false;

  const userField = page.locator('input[name="username"], input[autocomplete="username"]').first();
  const passField = page.locator('input[name="password"], input[type="password"], input[autocomplete="current-password"]').first();
  if (!await userField.count() || !await passField.count()) return false;

  await typeInto(userField, username);
  await page.waitForTimeout(700);
  await typeInto(passField, password);
  await page.waitForTimeout(700);
  await passField.press('Enter');
  await page.waitForTimeout(6500);
  await clickCloseIfVisible(page);
  return true;
}

async function run(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const runId = timestampUtc();
  const env = {
    ...loadEnvFromFile('/root/InstaFollow/.env'),
    ...process.env,
  };
  const results = [];

  for (const target of TARGETS) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...DEVICE, locale: 'de-DE' });
    try {
      if (fs.existsSync(target.sessionFile)) {
        const raw = JSON.parse(fs.readFileSync(target.sessionFile, 'utf8'));
        if (Array.isArray(raw.cookies)) {
          await context.addCookies(raw.cookies);
        }
      }

      const page = await context.newPage();
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4500);

      let finalUrl = page.url();
      let bodyText = await page.locator('body').innerText().catch(() => '');
      let state = summarizePage(finalUrl, bodyText);
      let autoClickedWeiter = false;

      if (state === 'kontoauswahl') {
        autoClickedWeiter = await clickWeiterIfVisible(page);
        finalUrl = page.url();
        bodyText = await page.locator('body').innerText().catch(() => '');
        state = summarizePage(finalUrl, bodyText);
      }

      const didLoginAttempt = await tryLoginIfNeeded(
        page,
        env[target.envUserKey],
        env[target.envPassKey],
      );
      if (didLoginAttempt) {
        await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(2500);
        finalUrl = page.url();
        bodyText = await page.locator('body').innerText().catch(() => '');
        state = summarizePage(finalUrl, bodyText);
      }

      const fileName = `${runId}-${target.key}.png`;
      const filePath = path.join(outputDir, fileName);
      await page.screenshot({ path: filePath, fullPage: true });

      results.push({
        account: target.key,
        state,
        finalUrl,
        autoClickedWeiter,
        didLoginAttempt,
        screenshot: filePath,
        sessionFile: target.sessionFile,
      });
    } catch (error) {
      results.push({
        account: target.key,
        state: 'error',
        error: error.message,
        sessionFile: target.sessionFile,
      });
    } finally {
      await context.close();
      await browser.close();
    }
  }

  fs.mkdirSync(LATEST_DIR, { recursive: true });
  fs.mkdirSync(DASHBOARD_PUBLIC_DIR, { recursive: true });

  for (const item of results) {
    if (!item.screenshot || !fs.existsSync(item.screenshot)) continue;
    const latestName = `${item.account}-latest.png`;
    const latestPath = path.join(LATEST_DIR, latestName);
    const publicPath = path.join(DASHBOARD_PUBLIC_DIR, latestName);
    fs.copyFileSync(item.screenshot, latestPath);
    fs.copyFileSync(item.screenshot, publicPath);
    item.latest = latestPath;
    item.publicUrl = `${PUBLIC_BASE_URL}/${latestName}`;
  }

  const reportPath = path.join(outputDir, `${runId}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ runId, generatedAt: new Date().toISOString(), results }, null, 2));

  console.log(JSON.stringify({ runId, outputDir, reportPath, results }, null, 2));
}

const outputDir = process.argv[2] || DEFAULT_OUTPUT_DIR;
run(outputDir).catch((err) => {
  console.error(err);
  process.exit(1);
});
