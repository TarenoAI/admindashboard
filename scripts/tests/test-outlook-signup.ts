import { firefox } from 'playwright';

async function testOutlook() {
    console.log('Starting Firefox...');
    const browser = await firefox.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        console.log('Navigating to Outlook Signup...');
        await page.goto('https://signup.live.com/signup', { waitUntil: 'networkidle' });
        
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'public/debug/outlook-signup-1.png' });
        console.log('Screenshot 1 saved.');

        // Try to enter a desired email
        const emailInput = page.locator('input[type="email"], input[name="MemberName"]');
        if (await emailInput.isVisible()) {
            await emailInput.fill('luna.vps.test.2026@outlook.com');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(5000);
            await page.screenshot({ path: 'public/debug/outlook-signup-2.png' });
            console.log('Screenshot 2 saved.');
        }

    } catch (err) {
        console.error('Error during signup test:', err);
    } finally {
        await browser.close();
    }
}

testOutlook();
