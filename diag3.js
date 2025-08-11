const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

const sleep = ms => new Promise(r=>setTimeout(r,ms));
const URL = 'https://bakamh.com/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    userDataDir: '/root/.cache/pptr-profile', // 复用 Cookie
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-dev-shm-usage','--disable-gpu',
      '--disable-blink-features=AutomationControlled'
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 824 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'upgrade-insecure-requests': '1',
  });

  let passed = false;
  for (let i=1; i<=6; i++) {
    console.log(`[TRY ${i}] goto`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(15000); // 给 Turnstile/JS 运行时间

    let title = (await page.title() || '').toLowerCase();
    let html  = await page.content();
    let hit   = /challenges\.cloudflare\.com|__cf_chl_|turnstile|just a moment|请稍候|正在验证/i.test(title+html);
    console.log(`[TRY ${i}] title=${title} challenge=${hit}`);
    await page.screenshot({ path: `cf_try${i}.png`, fullPage: true });
    if (!hit) { passed = true; break; }

    // 温和刷新一次
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(8000);
    title = (await page.title() || '').toLowerCase();
    html  = await page.content();
    hit   = /challenges\.cloudflare\.com|__cf_chl_|turnstile|just a moment|请稍候|正在验证/i.test(title+html);
    console.log(`[TRY ${i}] after reload title=${title} challenge=${hit}`);
    await page.screenshot({ path: `cf_try${i}_reload.png`, fullPage: true });
    if (!hit) { passed = true; break; }

    await sleep(4000);
  }

  console.log('PASSED =', passed);

  // dump cookies 看看是否拿到了 cf_clearance
  const cookies = await page.cookies().catch(()=>[]);
  require('fs').writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));

  await browser.close();
})();
