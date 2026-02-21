
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
    const iPhone = devices['iPhone 13 Pro'];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        ...iPhone,
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin'
    });
    const page = await context.newPage();

    console.log('Navigating to Instagram Signup...');
    try {
        await page.goto('https://www.instagram.com/accounts/emailsignup/', { waitUntil: 'networkidle' });
        await page.waitForTimeout(5000);
        
        // Handle cookie banner if present
        const acceptBtn = page.locator('button:has-text("Alle akzeptieren"), button:has-text("Allow all cookies")').first();
        if (await acceptBtn.isVisible()) {
            await acceptBtn.click();
            await page.waitForTimeout(2000);
        }

        await page.screenshot({ path: '/root/.openclaw/workspace-tareno/debug-ig-signup-start.png' });
        
        const email = process.env.IG_TEST_EMAIL || 'test@example.com';
        const fullName = 'Luna VPS';
        const username = process.env.IG_TEST_USERNAME || 'test_user_2026';
        const password = process.env.IG_TEST_PASSWORD || 'ChangeMe_OnlyForLocalTest123!';

        console.log(`Filling out form for ${email}...`);
        
        await page.fill('input[name="emailOrPhone"]', email);
        await page.fill('input[name="fullName"]', fullName);
        await page.fill('input[name="username"]', username);
        await page.fill('input[name="password"]', password);
        
        await page.screenshot({ path: '/root/.openclaw/workspace-tareno/debug-ig-signup-filled.png' });

        const submitBtn = page.locator('button[type="submit"]');
        if (await submitBtn.isVisible()) {
            console.log('Submitting signup form...');
            await submitBtn.click();
            await page.waitForTimeout(10000);
            await page.screenshot({ path: '/root/.openclaw/workspace-tareno/debug-ig-signup-result.png' });
            
            const bodyText = await page.innerText('body');
            console.log('Result body text excerpt:', bodyText.substring(0, 200));
        }

    } catch (err) {
        console.error('Error during signup:', err);
    } finally {
        await browser.close();
    }
}

main();
