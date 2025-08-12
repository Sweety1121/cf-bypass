const puppeteer = require('puppeteer');

(async () => {
  const url = 'https://bakamh.com/';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--proxy-server=socks5://127.0.0.1:7890' // 走本地 Clash socks5
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  console.log('[GO] open');

  let passed = false;

  for (let i = 1; i <= 2; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const title = await page.title();
      const challenged = title.includes('Just a moment...');
      console.log(`[TRY ${i}] title=${title} challenged=${challenged}`);
      if (!challenged) {
        passed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000)); // 等待再试
    } catch (e) {
      console.error(`[TRY ${i}] error:`, e.message);
    }
  }

  console.log(`PASSED = ${passed}`);

  await browser.close();
})();
