import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:8080/');
  
  // wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  const h1 = await page.evaluate(() => document.querySelector('h1')?.innerText);
  console.log('H1 text:', h1);
  console.log('Errors caught:', errors);
  
  await browser.close();
})();
