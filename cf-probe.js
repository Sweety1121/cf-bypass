const puppeteer = require('puppeteer');

(async () => {
  const url = 'https://bakamh.com/';

  console.log('[GO] open');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');

  let passed = false;
  for (let i = 1; i <= 2; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const title = await page.title();
      const challenged = title.includes('Just a moment') || title.includes('Attention Required');
      console.log(`[TRY ${i}] title=${title} challenged=${challenged}`);
      if (!challenged) {
        passed = true;
        break;
      }
    } catch (err) {
      console.error(`[TRY ${i}] ERROR: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log(`PASSED = ${passed}`);
  await browser.close();
})();
