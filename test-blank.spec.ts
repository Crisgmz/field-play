import { test, expect } from '@playwright/test';

test('check page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'screenshot.png' });
  
  const h1Text = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return h1 ? h1.innerText : 'NO_H1_FOUND';
  });
  console.log('H1:', h1Text);
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body start:', bodyText.substring(0, 100));
  
  console.log('Errors:', errors);
});
